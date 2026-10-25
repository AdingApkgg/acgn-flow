import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createRouterClient, ORPCError, type RouterClient } from "@orpc/server";
import bcrypt from "bcryptjs";
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "@/db/schema";
import type { Context } from "../../orpc";
import type { AppRouter } from "../_app";

// 只允许主验证流程在已确认的隔离数据库显式开启；测试不启动服务或发送邮件。
describe.skipIf(process.env.RUN_BUSINESS_INTEGRATION !== "1")("业务数据库集成", () => {
  const prefix = `business-${nanoid(10)}`;
  const ownerId = `${prefix}-owner`;
  const userId = `${prefix}-user`;
  const adminId = `${prefix}-admin`;
  const blockedId = `${prefix}-blocked`;
  const currentSession = `${prefix}-session`;
  const videoIds = ["c", "b", "a"].map((id) => `${prefix}-video-${id}`);
  const pendingId = `${prefix}-pending`;
  let db: typeof import("@/db").db;
  let pool: typeof import("@/db").pool;
  let redis: typeof import("@/lib/redis").redis;
  let appRouter: AppRouter;
  let anonymous: RouterClient<AppRouter>;
  let member: RouterClient<AppRouter>;
  let owner: RouterClient<AppRouter>;
  let admin: RouterClient<AppRouter>;
  let blocked: RouterClient<AppRouter>;
  let memberContext: Context;
  let ownerContext: Context;
  const registeredEmail = `${prefix}@example.test`.toLowerCase();
  const verificationIds: string[] = [];
  const extraUserIds: string[] = [];
  const extraVerificationEmails: string[] = [];
  const tagIdsToDelete: string[] = [];

  beforeAll(async () => {
    // 隔离业务测试禁止向真实搜索引擎提交合成视频地址。
    delete process.env.INDEXNOW_KEY;
    ({ db, pool } = await import("@/db"));
    ({ redis } = await import("@/lib/redis"));
    ({ appRouter } = await import("../_app"));
    const identities = [
      { id: ownerId, role: "OWNER" as const, isBanned: false },
      { id: userId, role: "USER" as const, isBanned: false },
      { id: adminId, role: "ADMIN" as const, isBanned: false },
      { id: blockedId, role: "USER" as const, isBanned: true },
    ];
    await db.insert(schema.user).values(
      identities.map((identity) => ({
        ...identity,
        name: identity.id,
        username: identity.id,
        email: `${identity.id}@example.test`,
      })),
    );
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(schema.video).values([
      ...videoIds.map((id) => ({
        id,
        title: id,
        videoUrl: "https://example.test/video.mp4",
        uploaderId: userId,
        status: "PUBLISHED" as const,
        createdAt,
      })),
      {
        id: pendingId,
        title: "未发布夹具",
        videoUrl: "https://example.test/private.mp4",
        uploaderId: userId,
        status: "PENDING" as const,
        createdAt,
      },
    ]);
    const makeClient = (id?: string, role: "USER" | "ADMIN" | "OWNER" = "USER") => {
      const context: Context = {
        db,
        redis,
        headers: new Headers(),
        ipv4Address: null,
        ipv6Address: null,
        userAgent: null,
        session: id
          ? ({
              jti: currentSession,
              user: { id, email: `${id}@example.test`, role, name: id, image: null, username: id },
              session: {
                id: currentSession,
                userId: id,
                token: `${prefix}-token`,
                createdAt: new Date(),
                updatedAt: new Date(),
                expiresAt: new Date(Date.now() + 3_600_000),
                ipAddress: null,
                userAgent: null,
              },
            } as NonNullable<Context["session"]>)
          : null,
      };
      if (id === userId) memberContext = context;
      if (id === ownerId) ownerContext = context;
      return createRouterClient(appRouter, { context });
    };
    anonymous = makeClient();
    member = makeClient(userId);
    owner = makeClient(ownerId, "OWNER");
    admin = makeClient(adminId, "ADMIN");
    blocked = makeClient(blockedId);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.user).where(eq(schema.user.email, registeredEmail));
    await db
      .delete(schema.user)
      .where(inArray(schema.user.id, [ownerId, userId, adminId, blockedId, ...extraUserIds]));
    if (tagIdsToDelete.length)
      await db.delete(schema.tag).where(inArray(schema.tag.id, tagIdsToDelete));
    if (verificationIds.length)
      await db
        .delete(schema.verificationCode)
        .where(inArray(schema.verificationCode.id, verificationIds));
    const keys = [
      ...videoIds.map((id) => `video:${id}`),
      `video:${pendingId}`,
      `verification:attempts:REGISTER:${registeredEmail}`,
      `verification:attempts:RESET_PASSWORD:${registeredEmail}`,
      ...extraVerificationEmails.map((email) => `verification:attempts:RESET_PASSWORD:${email}`),
    ];
    await redis.del(...keys);
    await pool.end();
    redis.disconnect();
  });

  test("迁移后保持全部 118 个接口路径", () => {
    expect(
      Object.values(appRouter).reduce((count, router) => count + Object.keys(router).length, 0),
    ).toBe(118);
  });

  test("匿名、封禁、管理员 scope 与站长的权限边界", async () => {
    await expect(anonymous.user.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(blocked.user.me()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(member.admin.getUserStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.admin.getUserStats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(owner.admin.getUserStats()).resolves.toHaveProperty("total");
  });

  test("公开查询不返回未发布视频，已有缓存也不能绕过状态", async () => {
    await expect(anonymous.video.getById({ id: pendingId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const video = await anonymous.video.getById({ id: videoIds[0] });
    expect(video.id).toBe(videoIds[0]);
    await db
      .update(schema.video)
      .set({ status: "REJECTED" })
      .where(eq(schema.video.id, videoIds[0]));
    await expect(anonymous.video.getById({ id: videoIds[0] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await db
      .update(schema.video)
      .set({ status: "PUBLISHED" })
      .where(eq(schema.video.id, videoIds[0]));
  });

  test("同时间游标分页不重复或漏项，关联数量保持原结构", async () => {
    const first = await anonymous.user.getVideos({ userId, limit: 2 });
    expect(first.videos.map((video) => video.id)).toEqual(videoIds.slice(0, 2));
    expect(first.videos[0]?._count).toEqual({ likes: 0, favorites: 0 });
    const second = await anonymous.user.getVideos({ userId, limit: 2, cursor: first.nextCursor });
    expect(second.videos.map((video) => video.id)).toEqual(videoIds.slice(2));
    const profile = await anonymous.user.getProfile({ id: userId });
    expect(profile._count.videos).toBe(3);
  });

  test("注册必须验证并消费验证码，密码只写认证 account", async () => {
    const verificationId = nanoid();
    verificationIds.push(verificationId);
    await db.insert(schema.verificationCode).values({
      id: verificationId,
      email: registeredEmail,
      code: "123456",
      type: "REGISTER",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const input = {
      email: registeredEmail,
      username: `test_${nanoid(8).replace(/-/g, "_")}`,
      password: "fixture-password",
      code: "000000",
    };
    await expect(anonymous.user.register(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const registered = await anonymous.user.register({ ...input, code: "123456" });
    const user = await db.query.user.findFirst({ where: eq(schema.user.id, registered.id) });
    const credential = await db.query.authAccount.findFirst({
      where: and(
        eq(schema.authAccount.userId, registered.id),
        eq(schema.authAccount.providerId, "credential"),
      ),
    });
    expect(user?.password).toBeNull();
    expect(user?.authEmailVerified).toBe(true);
    expect(await bcrypt.compare("fixture-password", credential?.password ?? "")).toBe(true);
    expect(
      (
        await db.query.verificationCode.findFirst({
          where: eq(schema.verificationCode.id, verificationId),
        })
      )?.used,
    ).toBe(true);
  });

  test("重置密码在事务中消费验证码并撤销已有认证会话", async () => {
    const user = await db.query.user.findFirst({ where: eq(schema.user.email, registeredEmail) });
    if (!user) throw new Error("注册夹具不存在");
    const verificationId = nanoid();
    verificationIds.push(verificationId);
    const sessionId = nanoid();
    await db.insert(schema.authSession).values({
      id: sessionId,
      token: nanoid(),
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(schema.verificationCode).values({
      id: verificationId,
      email: registeredEmail,
      code: "654321",
      type: "RESET_PASSWORD",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      anonymous.user.resetPassword({
        email: registeredEmail,
        newPassword: "new-fixture-password",
        code: "000000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await anonymous.user.resetPassword({
      email: registeredEmail,
      newPassword: "new-fixture-password",
      code: "654321",
    });
    expect(
      await db.query.authSession.findFirst({ where: eq(schema.authSession.id, sessionId) }),
    ).toBeUndefined();
    await expect(
      anonymous.user.resetPassword({
        email: registeredEmail,
        newPassword: "another-password",
        code: "654321",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("旧大小写邮箱可重置密码并保留原始邮箱值", async () => {
    const legacyId = `${prefix}-mixedcase`;
    const actualEmail = `Legacy.${prefix}@Example.Test`;
    const normalizedEmail = actualEmail.toLowerCase();
    const verificationId = nanoid();
    extraUserIds.push(legacyId);
    verificationIds.push(verificationId);
    extraVerificationEmails.push(normalizedEmail);
    await db
      .insert(schema.user)
      .values({ id: legacyId, email: actualEmail, name: "旧邮箱夹具", username: legacyId });
    await db.insert(schema.verificationCode).values({
      id: verificationId,
      email: normalizedEmail,
      code: "321654",
      type: "RESET_PASSWORD",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await anonymous.user.resetPassword({
      email: normalizedEmail,
      code: "321654",
      newPassword: "legacy-reset-password",
    });
    expect((await db.query.user.findFirst({ where: eq(schema.user.id, legacyId) }))?.email).toBe(
      actualEmail,
    );
    const credential = await db.query.authAccount.findFirst({
      where: and(
        eq(schema.authAccount.userId, legacyId),
        eq(schema.authAccount.providerId, "credential"),
      ),
    });
    expect(await bcrypt.compare("legacy-reset-password", credential?.password ?? "")).toBe(true);
  });

  test("注册和换邮箱按大小写无关方式拒绝已有旧邮箱", async () => {
    const actualEmail = `Legacy.${prefix}@Example.Test`;
    await expect(
      anonymous.user.register({
        email: actualEmail.toLowerCase(),
        username: `test_${nanoid(8).replace(/-/g, "_")}`,
        password: "fixture-password",
        code: "000000",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      member.user.updateAccount({ email: actualEmail.toLowerCase(), code: "000000" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("旧库同邮箱大小写碰撞拒绝重置和变更，不修改任何账号", async () => {
    const mixedEmail = `Collision.${prefix}@Example.Test`;
    const normalizedEmail = mixedEmail.toLowerCase();
    const ids = [nanoid(), nanoid()];
    extraUserIds.push(...ids);
    await db.insert(schema.user).values(
      ids.map((id, index) => ({
        id,
        email: index ? normalizedEmail : mixedEmail,
        username: `${prefix}-collision-${index}`,
        name: "碰撞夹具",
      })),
    );
    await db.insert(schema.authAccount).values(
      ids.map((id) => ({
        id: nanoid(),
        userId: id,
        accountId: id,
        providerId: "credential",
        password: "unchanged-fixture-hash",
      })),
    );
    const verificationId = nanoid();
    verificationIds.push(verificationId);
    await db.insert(schema.verificationCode).values({
      id: verificationId,
      email: normalizedEmail,
      code: "246810",
      type: "RESET_PASSWORD",
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      anonymous.user.resetPassword({
        email: normalizedEmail,
        code: "246810",
        newPassword: "must-not-be-written",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      member.user.updateAccount({ email: normalizedEmail, code: "246810" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (
        await db
          .select({ password: schema.authAccount.password })
          .from(schema.authAccount)
          .where(inArray(schema.authAccount.userId, ids))
      ).every((account) => account.password === "unchanged-fixture-hash"),
    ).toBe(true);
    expect(
      (
        await db.query.verificationCode.findFirst({
          where: eq(schema.verificationCode.id, verificationId),
        })
      )?.used,
    ).toBe(false);
    expect(
      (
        await db
          .select({ email: schema.user.email })
          .from(schema.user)
          .where(inArray(schema.user.id, ids))
      )
        .map((user) => user.email)
        .sort(),
    ).toEqual([mixedEmail, normalizedEmail].sort());
  });

  test("换邮箱必须验证新地址，同邮箱提交不能提升验证状态", async () => {
    await member.user.updateAccount({ email: `${userId}@example.test` });
    expect(
      (await db.query.user.findFirst({ where: eq(schema.user.id, userId) }))?.authEmailVerified,
    ).toBe(false);
    await expect(
      member.user.updateAccount({ email: `${prefix}-new@example.test` }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("撤销设备会话同时删除 Better Auth 真会话", async () => {
    const sessionId = nanoid();
    const auditId = nanoid();
    await db
      .insert(schema.authSession)
      .values({ id: sessionId, token: nanoid(), userId, expiresAt: new Date(Date.now() + 60_000) });
    await db
      .insert(schema.loginSession)
      .values({ id: auditId, jti: sessionId, userId, expiresAt: new Date(Date.now() + 60_000) });
    await member.user.revokeLoginSession({ id: auditId });
    expect(
      await db.query.authSession.findFirst({ where: eq(schema.authSession.id, sessionId) }),
    ).toBeUndefined();
    expect(
      (await db.query.loginSession.findFirst({ where: eq(schema.loginSession.id, auditId) }))
        ?.isRevoked,
    ).toBe(true);
  });

  test("评论反应与计数一致，并可读取回复关联计数", async () => {
    const commentId = nanoid();
    await db
      .insert(schema.comment)
      .values({ id: commentId, content: "集成测试夹具", videoId: videoIds[0], userId });
    const first = await member.comment.react({ commentId, isLike: true });
    expect(first).toEqual({ likes: 1, dislikes: 0, userReaction: true });
    const second = await member.comment.react({ commentId, isLike: false });
    expect(second).toEqual({ likes: 0, dislikes: 1, userReaction: false });
    const list = await anonymous.comment.list({ videoId: videoIds[0], limit: 10 });
    expect(list.comments.find((comment) => comment.id === commentId)?._count.replies).toBe(0);
  });

  test("合集剧集支持在唯一索引下互换顺序", async () => {
    const collection = await member.series.create({ title: "测试合集" });
    await member.series.addVideo({ seriesId: collection.id, videoId: videoIds[0], episodeNum: 1 });
    await member.series.addVideo({ seriesId: collection.id, videoId: videoIds[1], episodeNum: 2 });
    await member.series.reorderEpisodes({
      seriesId: collection.id,
      episodes: [
        { videoId: videoIds[0], episodeNum: 2 },
        { videoId: videoIds[1], episodeNum: 1 },
      ],
    });
    const result = await anonymous.series.getById({ id: collection.id });
    expect(result.episodes.map((episode) => episode.videoId)).toEqual([videoIds[1], videoIds[0]]);
  });

  // 注入最终写入失败，同时保留真实 PostgreSQL 事务；根连接与 tx 都会触发相同故障。
  function failWrite<T extends object>(
    database: T,
    operation: "insert" | "delete",
    table: object,
    failAt = 1,
    attempts = { count: 0 },
  ): T {
    return new Proxy(database, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (property === "transaction" && typeof value === "function") {
          return (callback: (transaction: object) => Promise<unknown>) =>
            Reflect.apply(value, target, [
              (transaction: object) =>
                callback(failWrite(transaction, operation, table, failAt, attempts)),
            ]);
        }
        if (property === operation && typeof value === "function") {
          return (writingTable: object) => {
            if (writingTable === table && ++attempts.count === failAt)
              throw new ORPCError("CONFLICT", { message: "injected final write failure" });
            return Reflect.apply(value, target, [writingTable]);
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  test("标签筛选、历史与会话的 EXISTS 子查询可真实执行", async () => {
    const tagId = nanoid();
    tagIdsToDelete.push(tagId);
    await db
      .insert(schema.tag)
      .values({ id: tagId, name: `${prefix}-filter`, slug: `${prefix}-filter` });
    await db.insert(schema.tagOnVideo).values({ tagId, videoId: videoIds[0] });
    const result = await anonymous.video.list({ tagId, limit: 10 });
    expect(result.videos.map((video) => video.id)).toEqual([videoIds[0]]);
    expect(result.totalCount).toBe(1);
    expect((await anonymous.comment.listRecent({ limit: 10 })).comments.length).toBeGreaterThan(0);
    expect(
      (await owner.admin.listComments({ search: prefix, limit: 10 })).comments.length,
    ).toBeGreaterThan(0);
    expect((await owner.admin.getTagStats()).withVideos).toBeGreaterThan(0);
    await member.video.recordHistory({ videoId: videoIds[0], progress: 12 });
    expect(
      (await member.video.getHistory({ limit: 10 })).history.some(
        (video) => video.id === videoIds[0],
      ),
    ).toBe(true);
    expect((await member.user.getLoginSessions({ limit: 10 })).sessions).toEqual([]);
  });

  test("标签合并中途失败时关联和源标签全部回滚", async () => {
    const sourceId = nanoid();
    const targetId = nanoid();
    tagIdsToDelete.push(sourceId, targetId);
    await db.insert(schema.tag).values([
      { id: sourceId, name: `${prefix}-rollback-source`, slug: `${prefix}-rollback-source` },
      { id: targetId, name: `${prefix}-rollback-target`, slug: `${prefix}-rollback-target` },
    ]);
    await db.insert(schema.tagOnVideo).values({ tagId: sourceId, videoId: videoIds[0] });
    const client = createRouterClient(appRouter, {
      context: { ...ownerContext, db: failWrite(db, "delete", schema.tag) },
    });
    await expect(
      client.admin.mergeTags({ sourceTagIds: [sourceId], targetTagId: targetId }),
    ).rejects.toThrow("injected final write failure");
    expect(
      await db.$count(
        schema.tagOnVideo,
        and(eq(schema.tagOnVideo.videoId, videoIds[0]), eq(schema.tagOnVideo.tagId, sourceId)),
      ),
    ).toBe(1);
    expect(
      await db.$count(
        schema.tagOnVideo,
        and(eq(schema.tagOnVideo.videoId, videoIds[0]), eq(schema.tagOnVideo.tagId, targetId)),
      ),
    ).toBe(0);
    expect(await db.$count(schema.tag, eq(schema.tag.id, sourceId))).toBe(1);
  });

  test("评论硬删除最后一步失败时恢复子评论与全部反应", async () => {
    const parentId = nanoid();
    const replyId = nanoid();
    await db
      .insert(schema.comment)
      .values({ id: parentId, userId, videoId: videoIds[0], content: "回滚父评论" });
    await db
      .insert(schema.comment)
      .values({ id: replyId, parentId, userId, videoId: videoIds[0], content: "回滚子评论" });
    await db.insert(schema.commentReaction).values([
      { userId, commentId: parentId, isLike: true },
      { userId, commentId: replyId, isLike: true },
    ]);
    const client = createRouterClient(appRouter, {
      context: { ...ownerContext, db: failWrite(db, "delete", schema.comment, 2) },
    });
    await expect(client.admin.hardDeleteComment({ commentId: parentId })).rejects.toThrow(
      "injected final write failure",
    );
    expect(await db.$count(schema.comment, inArray(schema.comment.id, [parentId, replyId]))).toBe(
      2,
    );
    expect(
      await db.$count(
        schema.commentReaction,
        inArray(schema.commentReaction.commentId, [parentId, replyId]),
      ),
    ).toBe(2);
    await owner.admin.hardDeleteComment({ commentId: parentId });
    expect(await db.$count(schema.comment, inArray(schema.comment.id, [parentId, replyId]))).toBe(
      0,
    );
  });

  test("批量评论 hide/show/delete/restore 及硬删除均验证状态和事务", async () => {
    const ids = [nanoid(), nanoid()];
    const replyId = nanoid();
    await db
      .insert(schema.comment)
      .values(ids.map((id) => ({ id, userId, videoId: videoIds[0], content: "批量动作夹具" })));
    await expect(
      admin.admin.batchCommentAction({ commentIds: ids, action: "hide" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const operations = [
      { action: "hide" as const, isHidden: true, isDeleted: false },
      { action: "show" as const, isHidden: false, isDeleted: false },
      { action: "delete" as const, isHidden: false, isDeleted: true },
      { action: "restore" as const, isHidden: false, isDeleted: false },
    ];
    for (const operation of operations) {
      expect(
        (await owner.admin.batchCommentAction({ commentIds: ids, action: operation.action })).count,
      ).toBe(2);
      const comments = await db
        .select()
        .from(schema.comment)
        .where(inArray(schema.comment.id, ids));
      expect(
        comments.every(
          (comment) =>
            comment.isHidden === operation.isHidden && comment.isDeleted === operation.isDeleted,
        ),
      ).toBe(true);
    }
    await db.insert(schema.comment).values({
      id: replyId,
      parentId: ids[0],
      userId,
      videoId: videoIds[0],
      content: "批量硬删回复",
    });
    await db.insert(schema.commentReaction).values({ userId, commentId: ids[0], isLike: true });
    const client = createRouterClient(appRouter, {
      context: { ...ownerContext, db: failWrite(db, "delete", schema.comment, 2) },
    });
    await expect(client.admin.batchHardDeleteComments({ commentIds: ids })).rejects.toThrow(
      "injected final write failure",
    );
    expect(await db.$count(schema.comment, inArray(schema.comment.id, [...ids, replyId]))).toBe(3);
    expect(
      await db.$count(schema.commentReaction, inArray(schema.commentReaction.commentId, ids)),
    ).toBe(1);
    expect((await owner.admin.batchHardDeleteComments({ commentIds: ids })).count).toBe(2);
    expect(await db.$count(schema.comment, inArray(schema.comment.id, [...ids, replyId]))).toBe(0);
  });

  test("视频反应最终写入失败时恢复之前的互斥反应", async () => {
    await db.insert(schema.dislike).values({ userId, videoId: videoIds[2] }).onConflictDoNothing();
    const client = createRouterClient(appRouter, {
      context: { ...memberContext, db: failWrite(db, "insert", schema.like) },
    });
    await expect(client.video.like({ videoId: videoIds[2] })).rejects.toThrow(
      "injected final write failure",
    );
    expect(
      await db.$count(
        schema.dislike,
        and(eq(schema.dislike.userId, userId), eq(schema.dislike.videoId, videoIds[2])),
      ),
    ).toBe(1);
    expect(
      await db.$count(
        schema.like,
        and(eq(schema.like.userId, userId), eq(schema.like.videoId, videoIds[2])),
      ),
    ).toBe(0);
  });

  test("超过连接池容量的并发反应无池外等待且保持互斥和计数一致", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) => {
        const input = { videoId: videoIds[2] };
        return index % 3 === 0
          ? member.video.like(input)
          : index % 3 === 1
            ? member.video.dislike(input)
            : member.video.confused(input);
      }),
    );
    const state = await member.video.getInteractionStatus({ videoId: videoIds[2] });
    expect(
      [state.liked, state.disliked, state.confused].filter(Boolean).length,
    ).toBeLessThanOrEqual(1);
    const commentId = nanoid();
    await db
      .insert(schema.comment)
      .values({ id: commentId, userId, videoId: videoIds[0], content: "并发反应夹具" });
    await Promise.all(
      Array.from({ length: 12 }, () => member.comment.react({ commentId, isLike: true })),
    );
    const comment = await db.query.comment.findFirst({ where: eq(schema.comment.id, commentId) });
    expect(comment?.likes).toBe(1);
    expect(comment?.dislikes).toBe(0);
    expect(
      await db.$count(schema.commentReaction, eq(schema.commentReaction.commentId, commentId)),
    ).toBe(1);
  }, 15_000);

  test("管理员别名入口执行相同 scope，授权后可操作", async () => {
    const tagId = nanoid();
    tagIdsToDelete.push(tagId);
    await db
      .insert(schema.tag)
      .values({ id: tagId, name: `${prefix}-scope`, slug: `${prefix}-scope` });
    await expect(admin.video.moderate({ id: pendingId, status: "REJECTED" })).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    await expect(
      admin.tag.create({ name: `scoped_${prefix}`, slug: `scoped_${prefix}` }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.tag.delete({ id: tagId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(admin.user.listUsers({ limit: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db
      .update(schema.user)
      .set({ adminScopes: ["video:moderate", "tag:manage", "user:view"] })
      .where(eq(schema.user.id, adminId));
    try {
      expect((await admin.video.moderate({ id: pendingId, status: "REJECTED" })).status).toBe(
        "REJECTED",
      );
      const created = await admin.tag.create({
        name: `scoped_${prefix}`,
        slug: `scoped_${prefix}`,
      });
      tagIdsToDelete.push(created.id);
      const users = await admin.user.listUsers({ search: userId, limit: 2 });
      expect(users.users[0]?._count.videos).toBe(4);
      const managedUsers = await admin.admin.listUsers({ search: userId, limit: 2 });
      expect(managedUsers.users[0]?._count.videos).toBe(4);
      await admin.tag.delete({ id: tagId });
    } finally {
      await db.update(schema.user).set({ adminScopes: null }).where(eq(schema.user.id, adminId));
    }
  });

  test("评论与留言管理 scope 不影响普通用户自己的删除和上传者置顶", async () => {
    const commentId = nanoid();
    const guestbookId = nanoid();
    await db
      .insert(schema.comment)
      .values({ id: commentId, userId, videoId: videoIds[0], content: "权限夹具" });
    await db.insert(schema.guestbook).values({ id: guestbookId, userId, content: "留言权限夹具" });
    await expect(admin.comment.delete({ id: commentId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(admin.comment.pin({ commentId, isPinned: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(admin.guestbook.delete({ id: guestbookId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      admin.guestbook.pin({ messageId: guestbookId, isPinned: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await member.comment.pin({ commentId, isPinned: true });
    await member.comment.delete({ id: commentId });
    await member.guestbook.delete({ id: guestbookId });
    expect(
      (await db.query.comment.findFirst({ where: eq(schema.comment.id, commentId) }))?.isDeleted,
    ).toBe(true);
    expect(
      (await db.query.guestbook.findFirst({ where: eq(schema.guestbook.id, guestbookId) }))
        ?.isDeleted,
    ).toBe(true);
  });

  test("普通用户上传和编辑自己视频时仍可创建及调整标签", async () => {
    const names = [`${prefix}-user-created`, `${prefix}-user-edited`];
    const created = await member.video.create({
      title: "普通用户上传夹具",
      videoUrl: "https://example.test/fixture.mp4",
      tagNames: [names[0]],
      skipIndexNow: true,
    });
    expect(created.uploaderId).toBe(userId);
    // 修改标签会执行 NOT EXISTS 清理，覆盖相同类型的原始 SQL 子查询。
    await member.video.update({
      id: created.id,
      description: "调整自有视频",
      tagNames: [names[1]],
    });
    const tags = await db
      .select({ id: schema.tag.id })
      .from(schema.tag)
      .where(inArray(schema.tag.name, names));
    tagIdsToDelete.push(...tags.map((tag) => tag.id));
    expect(tags.length).toBe(1);
    expect(await db.$count(schema.tagOnVideo, eq(schema.tagOnVideo.videoId, created.id))).toBe(1);
  });
});
