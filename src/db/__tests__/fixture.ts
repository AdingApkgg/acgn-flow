import { readFile } from "node:fs/promises";
import { hash } from "bcryptjs";
import type { PoolClient } from "pg";

export const fixturePassword = "migration-fixture-password";
export const fixtureTimestamp = new Date("2026-01-02T03:04:05.678Z");

/** 只可写入已确认的空测试 schema，覆盖全部 24 张原表。 */
export async function createLegacyFixture(client: PoolClient) {
  const { rows } = await client.query<{ count: string }>(`SELECT count(*)::text AS count
    FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`);
  if (rows[0].count !== "0") throw new Error("Legacy fixture requires an empty test schema");
  await client.query("BEGIN");
  try {
    await client.query(
      await readFile(new URL("../../../drizzle/baseline/0000_legacy.sql", import.meta.url), "utf8"),
    );
    const password = await hash(fixturePassword, 4);
    const insert = async (table: string, value: Record<string, unknown>) => {
      const keys = Object.keys(value);
      const params = Object.values(value).map((item) =>
        item !== null && typeof item === "object" && !(item instanceof Date)
          ? JSON.stringify(item)
          : item,
      );
      await client.query(
        `INSERT INTO "${table}" (${keys.map((key) => `"${key}"`).join(",")})
        VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
        params,
      );
    };
    for (const [id, role, verified] of [
      ["fixture_owner", "OWNER", true],
      ["fixture_user", "USER", false],
      ["fixture_admin", "ADMIN", false],
    ] as const) {
      await insert("User", {
        id,
        email: `${id}@example.invalid`,
        username: id,
        nickname: id === "fixture_owner" ? "旧昵称" : null,
        emailVerified: verified ? fixtureTimestamp : null,
        password: id === "fixture_user" ? null : password,
        role,
        adminScopes: role === "ADMIN" ? ["video:moderate"] : null,
        avatar: "https://example.invalid/avatar.png",
        socialLinks: { github: "synthetic" },
        createdAt: fixtureTimestamp,
        updatedAt: fixtureTimestamp,
      });
    }
    for (const [provider, userId] of [
      ["github", "fixture_owner"],
      ["google", "fixture_user"],
      ["discord", "fixture_user"],
    ]) {
      await insert("Account", {
        id: `fixture_${provider}`,
        userId,
        type: "oauth",
        provider,
        providerAccountId: `external_${provider}`,
        access_token: `synthetic_${provider}_access`,
        refresh_token: `synthetic_${provider}_refresh`,
        id_token: `synthetic_${provider}_id`,
        expires_at: 1_900_000_000,
        token_type: "bearer",
        scope: "openid profile",
        session_state: "retained-state",
      });
    }
    await insert("Session", {
      id: "fixture_session",
      sessionToken: "synthetic_old_session",
      userId: "fixture_owner",
      expires: new Date("2030-01-01T00:00:00.000Z"),
    });
    await insert("LoginSession", {
      id: "fixture_login",
      jti: "synthetic_old_jwt",
      userId: "fixture_owner",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      isRevoked: true,
    });
    await insert("VerificationToken", {
      identifier: "fixture_owner@example.invalid",
      token: "synthetic_legacy_token",
      expires: new Date("2030-01-01T00:00:00.000Z"),
    });
    await insert("VerificationCode", {
      id: "fixture_code",
      email: "fixture_user@example.invalid",
      code: "123456",
      type: "REGISTER",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    await insert("Video", {
      id: "fixture_video",
      title: "迁移夹具",
      uploaderId: "fixture_owner",
      videoUrl: "https://example.invalid/video.mp4",
      status: "PUBLISHED",
      views: 42,
      pages: [{ page: 1, title: "第一集", cid: 123 }],
      createdAt: fixtureTimestamp,
      updatedAt: fixtureTimestamp,
    });
    await insert("Series", {
      id: "fixture_series",
      title: "夹具合集",
      creatorId: "fixture_owner",
      updatedAt: fixtureTimestamp,
    });
    await insert("SeriesEpisode", {
      id: "fixture_episode",
      seriesId: "fixture_series",
      videoId: "fixture_video",
      episodeNum: 1,
    });
    await insert("Tag", { id: "fixture_tag", name: "自定义迁移标签", slug: "fixture-tag" });
    await insert("TagOnVideo", { videoId: "fixture_video", tagId: "fixture_tag" });
    for (const table of ["Favorite", "Like", "Dislike", "Confused", "WatchHistory"]) {
      await insert(table, {
        id: `fixture_${table}`,
        userId: "fixture_user",
        videoId: "fixture_video",
      });
    }
    await insert("Playlist", {
      id: "fixture_playlist",
      name: "迁移播放列表",
      userId: "fixture_user",
      updatedAt: fixtureTimestamp,
    });
    await insert("PlaylistItem", {
      id: "fixture_playlist_item",
      playlistId: "fixture_playlist",
      videoId: "fixture_video",
      sortOrder: 3,
    });
    await insert("Comment", {
      id: "fixture_comment",
      content: "保留的评论",
      userId: "fixture_owner",
      videoId: "fixture_video",
      updatedAt: fixtureTimestamp,
    });
    await insert("Comment", {
      id: "fixture_comment_reply",
      content: "保留的回复",
      userId: "fixture_user",
      videoId: "fixture_video",
      parentId: "fixture_comment",
      replyToUserId: "fixture_owner",
      deviceInfo: { browser: "fixture" },
      updatedAt: fixtureTimestamp,
    });
    await insert("CommentReaction", {
      id: "fixture_comment_reaction",
      userId: "fixture_user",
      commentId: "fixture_comment",
      isLike: true,
    });
    await insert("UserDevice", {
      id: "fixture_device",
      userId: "fixture_user",
      fingerprint: "synthetic_device",
      deviceType: "desktop",
    });
    await insert("Guestbook", {
      id: "fixture_guestbook",
      content: "保留的留言",
      userId: "fixture_owner",
      updatedAt: fixtureTimestamp,
    });
    await insert("Guestbook", {
      id: "fixture_guestbook_reply",
      content: "保留的留言回复",
      userId: "fixture_user",
      parentId: "fixture_guestbook",
      replyToUserId: "fixture_owner",
      updatedAt: fixtureTimestamp,
    });
    await insert("GuestbookReaction", {
      id: "fixture_guestbook_reaction",
      userId: "fixture_user",
      guestbookId: "fixture_guestbook",
      isLike: false,
    });
    await insert("SearchRecord", {
      id: "fixture_search",
      keyword: "迁移",
      userId: "fixture_user",
      resultCount: 1,
    });
    await insert("SearchRecord", { id: "fixture_search_anonymous", keyword: "匿名", userId: null });
    await client.query("COMMIT");
    return { users: 3, credentials: 2, oauth: 3, password };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
