// 业务表、列、枚举、索引沿用旧库名称；新增 ID 由应用生成，不改写既有 ID。
import { relations } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
const newId = (name = "id") =>
  text(name)
    .primaryKey()
    .$defaultFn(() => nanoid());
const date = (name: string) => timestamp(name, { precision: 3, mode: "date" });
const updatedDate = (name = "updatedAt") =>
  date(name)
    .notNull()
    .$onUpdate(() => new Date());

export const roleEnum = pgEnum("Role", ["USER", "ADMIN", "OWNER"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const verificationTypeEnum = pgEnum("VerificationType", [
  "REGISTER",
  "LOGIN",
  "RESET_PASSWORD",
  "CHANGE_EMAIL",
]);
export type VerificationType = (typeof verificationTypeEnum.enumValues)[number];

export const videoStatusEnum = pgEnum("VideoStatus", [
  "PENDING",
  "PUBLISHED",
  "REJECTED",
  "DELETED",
]);
export type VideoStatus = (typeof videoStatusEnum.enumValues)[number];

export const user = pgTable(
  "User",
  {
    id: newId("id"),
    email: text("email").notNull(),
    emailVerified: date("emailVerified"),
    username: text("username").notNull(),
    password: text("password"),
    nickname: text("nickname"),
    avatar: text("avatar"),
    bio: text("bio"),
    pronouns: text("pronouns"),
    website: text("website"),
    location: text("location"),
    socialLinks: jsonb("socialLinks").$type<JsonValue>(),
    role: roleEnum("role").notNull().default("USER"),
    adminScopes: jsonb("adminScopes").$type<JsonValue>(),
    isBanned: boolean("isBanned").notNull().default(false),
    banReason: text("banReason"),
    bannedAt: date("bannedAt"),
    lastIpLocation: text("lastIpLocation"),
    lastGpsLocation: text("lastGpsLocation"),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .$onUpdate(() => new Date()),
    // Better Auth 的布尔验证状态与旧 emailVerified 日期分别保存。
    name: text("name").notNull(),
    authEmailVerified: boolean("authEmailVerified").notNull().default(false),
  },
  (t) => [
    index("User_email_idx").on(t.email),
    index("User_username_idx").on(t.username),
    uniqueIndex("User_email_key").on(t.email),
    uniqueIndex("User_username_key").on(t.username),
  ],
);

export const account = pgTable(
  "Account",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    foreignKey({ name: "Account_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("Account_provider_providerAccountId_key").on(t.provider, t.providerAccountId),
    index("Account_userId_idx").on(t.userId),
  ],
);

export const session = pgTable(
  "Session",
  {
    id: newId("id"),
    sessionToken: text("sessionToken").notNull(),
    userId: text("userId").notNull(),
    expires: date("expires").notNull(),
  },
  (t) => [
    foreignKey({ name: "Session_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("Session_userId_idx").on(t.userId),
    uniqueIndex("Session_sessionToken_key").on(t.sessionToken),
  ],
);

export const loginSession = pgTable(
  "LoginSession",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    jti: text("jti").notNull(),
    deviceType: text("deviceType"),
    os: text("os"),
    osVersion: text("osVersion"),
    browser: text("browser"),
    browserVersion: text("browserVersion"),
    brand: text("brand"),
    model: text("model"),
    userAgent: text("userAgent"),
    ipv4Address: text("ipv4Address"),
    ipv4Location: text("ipv4Location"),
    ipv6Address: text("ipv6Address"),
    ipv6Location: text("ipv6Location"),
    gpsLocation: text("gpsLocation"),
    isRevoked: boolean("isRevoked").notNull().default(false),
    revokedAt: date("revokedAt"),
    expiresAt: date("expiresAt").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
    lastActiveAt: date("lastActiveAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "LoginSession_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("LoginSession_userId_idx").on(t.userId),
    index("LoginSession_jti_idx").on(t.jti),
    index("LoginSession_lastActiveAt_idx").on(t.lastActiveAt),
    uniqueIndex("LoginSession_jti_key").on(t.jti),
  ],
);

export const verificationToken = pgTable(
  "VerificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: date("expires").notNull(),
  },
  (t) => [
    uniqueIndex("VerificationToken_identifier_token_key").on(t.identifier, t.token),
    uniqueIndex("VerificationToken_token_key").on(t.token),
  ],
);

export const verificationCode = pgTable(
  "VerificationCode",
  {
    id: newId("id"),
    email: text("email").notNull(),
    code: text("code").notNull(),
    type: verificationTypeEnum("type").notNull(),
    expiresAt: date("expiresAt").notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("VerificationCode_email_type_idx").on(t.email, t.type),
    index("VerificationCode_expiresAt_idx").on(t.expiresAt),
  ],
);

export const video = pgTable(
  "Video",
  {
    id: newId("id"),
    title: text("title").notNull(),
    description: text("description"),
    coverUrl: text("coverUrl"),
    videoUrl: text("videoUrl").notNull(),
    subtitleUrl: text("subtitleUrl"),
    danmakuUrl: text("danmakuUrl"),
    duration: integer("duration"),
    views: integer("views").notNull().default(0),
    status: videoStatusEnum("status").notNull().default("PENDING"),
    pages: jsonb("pages").$type<JsonValue>(),
    uploaderId: text("uploaderId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: "Video_uploaderId_fkey",
      columns: [t.uploaderId],
      foreignColumns: [user.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("Video_uploaderId_idx").on(t.uploaderId),
    index("Video_status_idx").on(t.status),
    index("Video_createdAt_idx").on(t.createdAt),
  ],
);

export const series = pgTable(
  "Series",
  {
    id: newId("id"),
    title: text("title").notNull(),
    description: text("description"),
    coverUrl: text("coverUrl"),
    creatorId: text("creatorId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ name: "Series_creatorId_fkey", columns: [t.creatorId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("Series_creatorId_idx").on(t.creatorId),
    index("Series_createdAt_idx").on(t.createdAt),
  ],
);

export const seriesEpisode = pgTable(
  "SeriesEpisode",
  {
    id: newId("id"),
    seriesId: text("seriesId").notNull(),
    videoId: text("videoId").notNull(),
    episodeNum: integer("episodeNum").notNull(),
    episodeTitle: text("episodeTitle"),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "SeriesEpisode_seriesId_fkey",
      columns: [t.seriesId],
      foreignColumns: [series.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "SeriesEpisode_videoId_fkey",
      columns: [t.videoId],
      foreignColumns: [video.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("SeriesEpisode_seriesId_videoId_key").on(t.seriesId, t.videoId),
    uniqueIndex("SeriesEpisode_seriesId_episodeNum_key").on(t.seriesId, t.episodeNum),
    index("SeriesEpisode_seriesId_idx").on(t.seriesId),
    index("SeriesEpisode_videoId_idx").on(t.videoId),
  ],
);

export const tag = pgTable(
  "Tag",
  {
    id: newId("id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    index("Tag_slug_idx").on(t.slug),
    uniqueIndex("Tag_name_key").on(t.name),
    uniqueIndex("Tag_slug_key").on(t.slug),
  ],
);

export const tagOnVideo = pgTable(
  "TagOnVideo",
  {
    videoId: text("videoId").notNull(),
    tagId: text("tagId").notNull(),
  },
  (t) => [
    foreignKey({
      name: "TagOnVideo_videoId_fkey",
      columns: [t.videoId],
      foreignColumns: [video.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "TagOnVideo_tagId_fkey", columns: [t.tagId], foreignColumns: [tag.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    primaryKey({ name: "TagOnVideo_pkey", columns: [t.videoId, t.tagId] }),
    index("TagOnVideo_tagId_idx").on(t.tagId),
  ],
);

export const favorite = pgTable(
  "Favorite",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    videoId: text("videoId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "Favorite_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Favorite_videoId_fkey", columns: [t.videoId], foreignColumns: [video.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("Favorite_userId_videoId_key").on(t.userId, t.videoId),
    index("Favorite_userId_idx").on(t.userId),
    index("Favorite_videoId_idx").on(t.videoId),
  ],
);

export const like = pgTable(
  "Like",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    videoId: text("videoId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "Like_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Like_videoId_fkey", columns: [t.videoId], foreignColumns: [video.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("Like_userId_videoId_key").on(t.userId, t.videoId),
    index("Like_userId_idx").on(t.userId),
    index("Like_videoId_idx").on(t.videoId),
  ],
);

export const dislike = pgTable(
  "Dislike",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    videoId: text("videoId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "Dislike_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Dislike_videoId_fkey", columns: [t.videoId], foreignColumns: [video.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("Dislike_userId_videoId_key").on(t.userId, t.videoId),
    index("Dislike_userId_idx").on(t.userId),
    index("Dislike_videoId_idx").on(t.videoId),
  ],
);

export const confused = pgTable(
  "Confused",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    videoId: text("videoId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "Confused_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Confused_videoId_fkey", columns: [t.videoId], foreignColumns: [video.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("Confused_userId_videoId_key").on(t.userId, t.videoId),
    index("Confused_userId_idx").on(t.userId),
    index("Confused_videoId_idx").on(t.videoId),
  ],
);

export const watchHistory = pgTable(
  "WatchHistory",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    videoId: text("videoId").notNull(),
    progress: integer("progress").notNull().default(0),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ name: "WatchHistory_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "WatchHistory_videoId_fkey",
      columns: [t.videoId],
      foreignColumns: [video.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("WatchHistory_userId_videoId_key").on(t.userId, t.videoId),
    index("WatchHistory_userId_idx").on(t.userId),
    index("WatchHistory_videoId_idx").on(t.videoId),
    index("WatchHistory_updatedAt_idx").on(t.updatedAt),
  ],
);

export const playlist = pgTable(
  "Playlist",
  {
    id: newId("id"),
    name: text("name").notNull(),
    description: text("description"),
    isPublic: boolean("isPublic").notNull().default(true),
    userId: text("userId").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ name: "Playlist_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("Playlist_userId_idx").on(t.userId),
  ],
);

export const playlistItem = pgTable(
  "PlaylistItem",
  {
    id: newId("id"),
    playlistId: text("playlistId").notNull(),
    videoId: text("videoId").notNull(),
    sortOrder: integer("sortOrder").notNull().default(0),
    addedAt: date("addedAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "PlaylistItem_playlistId_fkey",
      columns: [t.playlistId],
      foreignColumns: [playlist.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "PlaylistItem_videoId_fkey",
      columns: [t.videoId],
      foreignColumns: [video.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("PlaylistItem_playlistId_videoId_key").on(t.playlistId, t.videoId),
    index("PlaylistItem_playlistId_idx").on(t.playlistId),
    index("PlaylistItem_videoId_idx").on(t.videoId),
  ],
);

export const comment = pgTable(
  "Comment",
  {
    id: newId("id"),
    content: text("content").notNull(),
    userId: text("userId").notNull(),
    videoId: text("videoId").notNull(),
    parentId: text("parentId"),
    replyToUserId: text("replyToUserId"),
    ipv4Address: text("ipv4Address"),
    ipv4Location: text("ipv4Location"),
    ipv6Address: text("ipv6Address"),
    ipv6Location: text("ipv6Location"),
    gpsLocation: text("gpsLocation"),
    deviceInfo: jsonb("deviceInfo").$type<JsonValue>(),
    userAgent: text("userAgent"),
    likes: integer("likes").notNull().default(0),
    dislikes: integer("dislikes").notNull().default(0),
    isEdited: boolean("isEdited").notNull().default(false),
    isPinned: boolean("isPinned").notNull().default(false),
    isDeleted: boolean("isDeleted").notNull().default(false),
    isHidden: boolean("isHidden").notNull().default(false),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ name: "Comment_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Comment_videoId_fkey", columns: [t.videoId], foreignColumns: [video.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Comment_parentId_fkey", columns: [t.parentId], foreignColumns: [t.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    foreignKey({
      name: "Comment_replyToUserId_fkey",
      columns: [t.replyToUserId],
      foreignColumns: [user.id],
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    index("Comment_videoId_createdAt_idx").on(t.videoId, t.createdAt),
    index("Comment_videoId_likes_idx").on(t.videoId, t.likes),
    index("Comment_userId_idx").on(t.userId),
    index("Comment_parentId_idx").on(t.parentId),
  ],
);

export const userDevice = pgTable(
  "UserDevice",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    fingerprint: text("fingerprint").notNull(),
    deviceType: text("deviceType"),
    os: text("os"),
    osVersion: text("osVersion"),
    browser: text("browser"),
    browserVersion: text("browserVersion"),
    brand: text("brand"),
    model: text("model"),
    userAgent: text("userAgent"),
    ipv4Address: text("ipv4Address"),
    ipv4Location: text("ipv4Location"),
    ipv6Address: text("ipv6Address"),
    ipv6Location: text("ipv6Location"),
    gpsLocation: text("gpsLocation"),
    lastActiveAt: date("lastActiveAt").notNull().defaultNow(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "UserDevice_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("UserDevice_userId_fingerprint_key").on(t.userId, t.fingerprint),
    index("UserDevice_userId_idx").on(t.userId),
    index("UserDevice_lastActiveAt_idx").on(t.lastActiveAt),
  ],
);

export const commentReaction = pgTable(
  "CommentReaction",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    commentId: text("commentId").notNull(),
    isLike: boolean("isLike").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "CommentReaction_userId_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "CommentReaction_commentId_fkey",
      columns: [t.commentId],
      foreignColumns: [comment.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("CommentReaction_userId_commentId_key").on(t.userId, t.commentId),
    index("CommentReaction_commentId_idx").on(t.commentId),
  ],
);

export const guestbook = pgTable(
  "Guestbook",
  {
    id: newId("id"),
    content: text("content").notNull(),
    userId: text("userId").notNull(),
    parentId: text("parentId"),
    replyToUserId: text("replyToUserId"),
    ipv4Address: text("ipv4Address"),
    ipv4Location: text("ipv4Location"),
    ipv6Address: text("ipv6Address"),
    ipv6Location: text("ipv6Location"),
    gpsLocation: text("gpsLocation"),
    deviceInfo: jsonb("deviceInfo").$type<JsonValue>(),
    userAgent: text("userAgent"),
    likes: integer("likes").notNull().default(0),
    dislikes: integer("dislikes").notNull().default(0),
    isEdited: boolean("isEdited").notNull().default(false),
    isPinned: boolean("isPinned").notNull().default(false),
    isDeleted: boolean("isDeleted").notNull().default(false),
    isHidden: boolean("isHidden").notNull().default(false),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: date("updatedAt")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({ name: "Guestbook_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({ name: "Guestbook_parentId_fkey", columns: [t.parentId], foreignColumns: [t.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    foreignKey({
      name: "Guestbook_replyToUserId_fkey",
      columns: [t.replyToUserId],
      foreignColumns: [user.id],
    })
      .onDelete("set null")
      .onUpdate("cascade"),
    index("Guestbook_createdAt_idx").on(t.createdAt),
    index("Guestbook_likes_idx").on(t.likes),
    index("Guestbook_userId_idx").on(t.userId),
    index("Guestbook_parentId_idx").on(t.parentId),
  ],
);

export const guestbookReaction = pgTable(
  "GuestbookReaction",
  {
    id: newId("id"),
    userId: text("userId").notNull(),
    guestbookId: text("guestbookId").notNull(),
    isLike: boolean("isLike").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "GuestbookReaction_userId_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    foreignKey({
      name: "GuestbookReaction_guestbookId_fkey",
      columns: [t.guestbookId],
      foreignColumns: [guestbook.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("GuestbookReaction_userId_guestbookId_key").on(t.userId, t.guestbookId),
    index("GuestbookReaction_guestbookId_idx").on(t.guestbookId),
  ],
);

export const searchRecord = pgTable(
  "SearchRecord",
  {
    id: newId("id"),
    keyword: text("keyword").notNull(),
    userId: text("userId"),
    resultCount: integer("resultCount").notNull().default(0),
    createdAt: date("createdAt").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "SearchRecord_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("set null")
      .onUpdate("cascade"),
    index("SearchRecord_keyword_idx").on(t.keyword),
    index("SearchRecord_createdAt_idx").on(t.createdAt),
    index("SearchRecord_userId_idx").on(t.userId),
  ],
);

export const authAccount = pgTable(
  "AuthAccount",
  {
    id: newId(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull(),
    password: text("password"),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: date("accessTokenExpiresAt"),
    refreshTokenExpiresAt: date("refreshTokenExpiresAt"),
    scope: text("scope"),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: updatedDate().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "AuthAccount_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("AuthAccount_providerId_accountId_key").on(t.providerId, t.accountId),
    index("AuthAccount_userId_idx").on(t.userId),
  ],
);

export const authSession = pgTable(
  "AuthSession",
  {
    id: newId(),
    token: text("token").notNull(),
    userId: text("userId").notNull(),
    expiresAt: date("expiresAt").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: updatedDate().defaultNow(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
  },
  (t) => [
    foreignKey({ name: "AuthSession_userId_fkey", columns: [t.userId], foreignColumns: [user.id] })
      .onDelete("cascade")
      .onUpdate("cascade"),
    uniqueIndex("AuthSession_token_key").on(t.token),
    index("AuthSession_userId_idx").on(t.userId),
    index("AuthSession_expiresAt_idx").on(t.expiresAt),
  ],
);

export const authVerification = pgTable(
  "AuthVerification",
  {
    id: newId(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expiresAt").notNull(),
    createdAt: date("createdAt").notNull().defaultNow(),
    updatedAt: updatedDate().defaultNow(),
  },
  (t) => [index("AuthVerification_identifier_idx").on(t.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
  loginSessions: many(loginSession),
  videos: many(video),
  series: many(series),
  favorites: many(favorite),
  watchHistory: many(watchHistory),
  likes: many(like),
  dislikes: many(dislike),
  confused: many(confused),
  playlists: many(playlist),
  comments: many(comment, { relationName: "CommentAuthor" }),
  commentRepliesTo: many(comment, { relationName: "CommentReplyTo" }),
  commentReactions: many(commentReaction),
  devices: many(userDevice),
  guestbooks: many(guestbook, { relationName: "GuestbookAuthor" }),
  guestbookRepliesTo: many(guestbook, { relationName: "GuestbookReplyTo" }),
  guestbookReactions: many(guestbookReaction),
  searchRecords: many(searchRecord),
  authAccounts: many(authAccount),
  authSessions: many(authSession),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const loginSessionRelations = relations(loginSession, ({ one }) => ({
  user: one(user, { fields: [loginSession.userId], references: [user.id] }),
}));

export const videoRelations = relations(video, ({ one, many }) => ({
  tags: many(tagOnVideo),
  uploader: one(user, { fields: [video.uploaderId], references: [user.id] }),
  seriesEpisodes: many(seriesEpisode),
  favorites: many(favorite),
  watchHistory: many(watchHistory),
  likes: many(like),
  dislikes: many(dislike),
  confused: many(confused),
  playlistItems: many(playlistItem),
  comments: many(comment),
}));

export const seriesRelations = relations(series, ({ one, many }) => ({
  creator: one(user, { fields: [series.creatorId], references: [user.id] }),
  episodes: many(seriesEpisode),
}));

export const seriesEpisodeRelations = relations(seriesEpisode, ({ one }) => ({
  series: one(series, { fields: [seriesEpisode.seriesId], references: [series.id] }),
  video: one(video, { fields: [seriesEpisode.videoId], references: [video.id] }),
}));

export const tagRelations = relations(tag, ({ many }) => ({
  videos: many(tagOnVideo),
}));

export const tagOnVideoRelations = relations(tagOnVideo, ({ one }) => ({
  video: one(video, { fields: [tagOnVideo.videoId], references: [video.id] }),
  tag: one(tag, { fields: [tagOnVideo.tagId], references: [tag.id] }),
}));

export const favoriteRelations = relations(favorite, ({ one }) => ({
  user: one(user, { fields: [favorite.userId], references: [user.id] }),
  video: one(video, { fields: [favorite.videoId], references: [video.id] }),
}));

export const likeRelations = relations(like, ({ one }) => ({
  user: one(user, { fields: [like.userId], references: [user.id] }),
  video: one(video, { fields: [like.videoId], references: [video.id] }),
}));

export const dislikeRelations = relations(dislike, ({ one }) => ({
  user: one(user, { fields: [dislike.userId], references: [user.id] }),
  video: one(video, { fields: [dislike.videoId], references: [video.id] }),
}));

export const confusedRelations = relations(confused, ({ one }) => ({
  user: one(user, { fields: [confused.userId], references: [user.id] }),
  video: one(video, { fields: [confused.videoId], references: [video.id] }),
}));

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
  user: one(user, { fields: [watchHistory.userId], references: [user.id] }),
  video: one(video, { fields: [watchHistory.videoId], references: [video.id] }),
}));

export const playlistRelations = relations(playlist, ({ one, many }) => ({
  user: one(user, { fields: [playlist.userId], references: [user.id] }),
  items: many(playlistItem),
}));

export const playlistItemRelations = relations(playlistItem, ({ one }) => ({
  playlist: one(playlist, { fields: [playlistItem.playlistId], references: [playlist.id] }),
  video: one(video, { fields: [playlistItem.videoId], references: [video.id] }),
}));

export const commentRelations = relations(comment, ({ one, many }) => ({
  user: one(user, {
    fields: [comment.userId],
    references: [user.id],
    relationName: "CommentAuthor",
  }),
  video: one(video, { fields: [comment.videoId], references: [video.id] }),
  parent: one(comment, {
    fields: [comment.parentId],
    references: [comment.id],
    relationName: "CommentReplies",
  }),
  replies: many(comment, { relationName: "CommentReplies" }),
  replyToUser: one(user, {
    fields: [comment.replyToUserId],
    references: [user.id],
    relationName: "CommentReplyTo",
  }),
  reactions: many(commentReaction),
}));

export const userDeviceRelations = relations(userDevice, ({ one }) => ({
  user: one(user, { fields: [userDevice.userId], references: [user.id] }),
}));

export const commentReactionRelations = relations(commentReaction, ({ one }) => ({
  user: one(user, { fields: [commentReaction.userId], references: [user.id] }),
  comment: one(comment, { fields: [commentReaction.commentId], references: [comment.id] }),
}));

export const guestbookRelations = relations(guestbook, ({ one, many }) => ({
  user: one(user, {
    fields: [guestbook.userId],
    references: [user.id],
    relationName: "GuestbookAuthor",
  }),
  parent: one(guestbook, {
    fields: [guestbook.parentId],
    references: [guestbook.id],
    relationName: "GuestbookReplies",
  }),
  replies: many(guestbook, { relationName: "GuestbookReplies" }),
  replyToUser: one(user, {
    fields: [guestbook.replyToUserId],
    references: [user.id],
    relationName: "GuestbookReplyTo",
  }),
  reactions: many(guestbookReaction),
}));

export const guestbookReactionRelations = relations(guestbookReaction, ({ one }) => ({
  user: one(user, { fields: [guestbookReaction.userId], references: [user.id] }),
  guestbook: one(guestbook, {
    fields: [guestbookReaction.guestbookId],
    references: [guestbook.id],
  }),
}));

export const searchRecordRelations = relations(searchRecord, ({ one }) => ({
  user: one(user, { fields: [searchRecord.userId], references: [user.id] }),
}));

export const authAccountRelations = relations(authAccount, ({ one }) => ({
  user: one(user, { fields: [authAccount.userId], references: [user.id] }),
}));
export const authSessionRelations = relations(authSession, ({ one }) => ({
  user: one(user, { fields: [authSession.userId], references: [user.id] }),
}));

export type User = typeof user.$inferSelect;
export type AuthSession = typeof authSession.$inferSelect;
export type AuthAccount = typeof authAccount.$inferSelect;

export type Account = typeof account.$inferSelect;
export type Session = typeof session.$inferSelect;
export type LoginSession = typeof loginSession.$inferSelect;
export type VerificationToken = typeof verificationToken.$inferSelect;
export type VerificationCode = typeof verificationCode.$inferSelect;
export type Video = typeof video.$inferSelect;
export type Series = typeof series.$inferSelect;
export type SeriesEpisode = typeof seriesEpisode.$inferSelect;
export type Tag = typeof tag.$inferSelect;
export type TagOnVideo = typeof tagOnVideo.$inferSelect;
export type Favorite = typeof favorite.$inferSelect;
export type Like = typeof like.$inferSelect;
export type Dislike = typeof dislike.$inferSelect;
export type Confused = typeof confused.$inferSelect;
export type WatchHistory = typeof watchHistory.$inferSelect;
export type Playlist = typeof playlist.$inferSelect;
export type PlaylistItem = typeof playlistItem.$inferSelect;
export type Comment = typeof comment.$inferSelect;
export type UserDevice = typeof userDevice.$inferSelect;
export type CommentReaction = typeof commentReaction.$inferSelect;
export type Guestbook = typeof guestbook.$inferSelect;
export type GuestbookReaction = typeof guestbookReaction.$inferSelect;
export type SearchRecord = typeof searchRecord.$inferSelect;
export type AuthVerification = typeof authVerification.$inferSelect;
