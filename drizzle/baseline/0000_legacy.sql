-- 仅用于空数据库或隔离旧结构夹具；既有库升级不能执行本文件。

CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'OWNER');

CREATE TYPE "VerificationType" AS ENUM ('REGISTER', 'LOGIN', 'RESET_PASSWORD', 'CHANGE_EMAIL');

CREATE TYPE "VideoStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'DELETED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  "email" TEXT NOT NULL,
  "emailVerified" TIMESTAMP(3),
  "username" TEXT NOT NULL,
  "password" TEXT,
  "nickname" TEXT,
  "avatar" TEXT,
  "bio" TEXT,
  "pronouns" TEXT,
  "website" TEXT,
  "location" TEXT,
  "socialLinks" JSONB,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "adminScopes" JSONB,
  "isBanned" BOOLEAN NOT NULL DEFAULT false,
  "banReason" TEXT,
  "bannedAt" TIMESTAMP(3),
  "lastIpLocation" TEXT,
  "lastGpsLocation" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id"),
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "LoginSession" (
  "id" TEXT NOT NULL,
  CONSTRAINT "LoginSession_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "deviceType" TEXT,
  "os" TEXT,
  "osVersion" TEXT,
  "browser" TEXT,
  "browserVersion" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "userAgent" TEXT,
  "ipv4Address" TEXT,
  "ipv4Location" TEXT,
  "ipv6Address" TEXT,
  "ipv6Location" TEXT,
  "gpsLocation" TEXT,
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "revokedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "VerificationCode" (
  "id" TEXT NOT NULL,
  CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id"),
  "email" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" "VerificationType" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Video" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Video_pkey" PRIMARY KEY ("id"),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "videoUrl" TEXT NOT NULL,
  "subtitleUrl" TEXT,
  "danmakuUrl" TEXT,
  "duration" INTEGER,
  "views" INTEGER NOT NULL DEFAULT 0,
  "status" "VideoStatus" NOT NULL DEFAULT 'PENDING',
  "pages" JSONB,
  "uploaderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "Series" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Series_pkey" PRIMARY KEY ("id"),
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coverUrl" TEXT,
  "creatorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "SeriesEpisode" (
  "id" TEXT NOT NULL,
  CONSTRAINT "SeriesEpisode_pkey" PRIMARY KEY ("id"),
  "seriesId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "episodeNum" INTEGER NOT NULL,
  "episodeTitle" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id"),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "TagOnVideo" (
  "videoId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  CONSTRAINT "TagOnVideo_pkey" PRIMARY KEY ("videoId", "tagId")
);

CREATE TABLE "Favorite" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Like" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Like_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Dislike" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Dislike_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Confused" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Confused_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WatchHistory" (
  "id" TEXT NOT NULL,
  CONSTRAINT "WatchHistory_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "progress" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Playlist" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id"),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isPublic" BOOLEAN NOT NULL DEFAULT true,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "PlaylistItem" (
  "id" TEXT NOT NULL,
  CONSTRAINT "PlaylistItem_pkey" PRIMARY KEY ("id"),
  "playlistId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"),
  "content" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "parentId" TEXT,
  "replyToUserId" TEXT,
  "ipv4Address" TEXT,
  "ipv4Location" TEXT,
  "ipv6Address" TEXT,
  "ipv6Location" TEXT,
  "gpsLocation" TEXT,
  "deviceInfo" JSONB,
  "userAgent" TEXT,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "dislikes" INTEGER NOT NULL DEFAULT 0,
  "isEdited" BOOLEAN NOT NULL DEFAULT false,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "UserDevice" (
  "id" TEXT NOT NULL,
  CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "deviceType" TEXT,
  "os" TEXT,
  "osVersion" TEXT,
  "browser" TEXT,
  "browserVersion" TEXT,
  "brand" TEXT,
  "model" TEXT,
  "userAgent" TEXT,
  "ipv4Address" TEXT,
  "ipv4Location" TEXT,
  "ipv6Address" TEXT,
  "ipv6Location" TEXT,
  "gpsLocation" TEXT,
  "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CommentReaction" (
  "id" TEXT NOT NULL,
  CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "isLike" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Guestbook" (
  "id" TEXT NOT NULL,
  CONSTRAINT "Guestbook_pkey" PRIMARY KEY ("id"),
  "content" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "parentId" TEXT,
  "replyToUserId" TEXT,
  "ipv4Address" TEXT,
  "ipv4Location" TEXT,
  "ipv6Address" TEXT,
  "ipv6Location" TEXT,
  "gpsLocation" TEXT,
  "deviceInfo" JSONB,
  "userAgent" TEXT,
  "likes" INTEGER NOT NULL DEFAULT 0,
  "dislikes" INTEGER NOT NULL DEFAULT 0,
  "isEdited" BOOLEAN NOT NULL DEFAULT false,
  "isPinned" BOOLEAN NOT NULL DEFAULT false,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "isHidden" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "GuestbookReaction" (
  "id" TEXT NOT NULL,
  CONSTRAINT "GuestbookReaction_pkey" PRIMARY KEY ("id"),
  "userId" TEXT NOT NULL,
  "guestbookId" TEXT NOT NULL,
  "isLike" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SearchRecord" (
  "id" TEXT NOT NULL,
  CONSTRAINT "SearchRecord_pkey" PRIMARY KEY ("id"),
  "keyword" TEXT NOT NULL,
  "userId" TEXT,
  "resultCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "User_email_idx" ON "User" ("email");

CREATE INDEX "User_username_idx" ON "User" ("username");

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");

CREATE UNIQUE INDEX "User_username_key" ON "User" ("username");

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account" ("provider", "providerAccountId");

CREATE INDEX "Account_userId_idx" ON "Account" ("userId");

CREATE INDEX "Session_userId_idx" ON "Session" ("userId");

CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session" ("sessionToken");

CREATE INDEX "LoginSession_userId_idx" ON "LoginSession" ("userId");

CREATE INDEX "LoginSession_jti_idx" ON "LoginSession" ("jti");

CREATE INDEX "LoginSession_lastActiveAt_idx" ON "LoginSession" ("lastActiveAt");

CREATE UNIQUE INDEX "LoginSession_jti_key" ON "LoginSession" ("jti");

CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken" ("identifier", "token");

CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken" ("token");

CREATE INDEX "VerificationCode_email_type_idx" ON "VerificationCode" ("email", "type");

CREATE INDEX "VerificationCode_expiresAt_idx" ON "VerificationCode" ("expiresAt");

CREATE INDEX "Video_uploaderId_idx" ON "Video" ("uploaderId");

CREATE INDEX "Video_status_idx" ON "Video" ("status");

CREATE INDEX "Video_createdAt_idx" ON "Video" ("createdAt");

CREATE INDEX "Series_creatorId_idx" ON "Series" ("creatorId");

CREATE INDEX "Series_createdAt_idx" ON "Series" ("createdAt");

CREATE UNIQUE INDEX "SeriesEpisode_seriesId_videoId_key" ON "SeriesEpisode" ("seriesId", "videoId");

CREATE UNIQUE INDEX "SeriesEpisode_seriesId_episodeNum_key" ON "SeriesEpisode" ("seriesId", "episodeNum");

CREATE INDEX "SeriesEpisode_seriesId_idx" ON "SeriesEpisode" ("seriesId");

CREATE INDEX "SeriesEpisode_videoId_idx" ON "SeriesEpisode" ("videoId");

CREATE INDEX "Tag_slug_idx" ON "Tag" ("slug");

CREATE UNIQUE INDEX "Tag_name_key" ON "Tag" ("name");

CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag" ("slug");

CREATE INDEX "TagOnVideo_tagId_idx" ON "TagOnVideo" ("tagId");

CREATE UNIQUE INDEX "Favorite_userId_videoId_key" ON "Favorite" ("userId", "videoId");

CREATE INDEX "Favorite_userId_idx" ON "Favorite" ("userId");

CREATE INDEX "Favorite_videoId_idx" ON "Favorite" ("videoId");

CREATE UNIQUE INDEX "Like_userId_videoId_key" ON "Like" ("userId", "videoId");

CREATE INDEX "Like_userId_idx" ON "Like" ("userId");

CREATE INDEX "Like_videoId_idx" ON "Like" ("videoId");

CREATE UNIQUE INDEX "Dislike_userId_videoId_key" ON "Dislike" ("userId", "videoId");

CREATE INDEX "Dislike_userId_idx" ON "Dislike" ("userId");

CREATE INDEX "Dislike_videoId_idx" ON "Dislike" ("videoId");

CREATE UNIQUE INDEX "Confused_userId_videoId_key" ON "Confused" ("userId", "videoId");

CREATE INDEX "Confused_userId_idx" ON "Confused" ("userId");

CREATE INDEX "Confused_videoId_idx" ON "Confused" ("videoId");

CREATE UNIQUE INDEX "WatchHistory_userId_videoId_key" ON "WatchHistory" ("userId", "videoId");

CREATE INDEX "WatchHistory_userId_idx" ON "WatchHistory" ("userId");

CREATE INDEX "WatchHistory_videoId_idx" ON "WatchHistory" ("videoId");

CREATE INDEX "WatchHistory_updatedAt_idx" ON "WatchHistory" ("updatedAt");

CREATE INDEX "Playlist_userId_idx" ON "Playlist" ("userId");

CREATE UNIQUE INDEX "PlaylistItem_playlistId_videoId_key" ON "PlaylistItem" ("playlistId", "videoId");

CREATE INDEX "PlaylistItem_playlistId_idx" ON "PlaylistItem" ("playlistId");

CREATE INDEX "PlaylistItem_videoId_idx" ON "PlaylistItem" ("videoId");

CREATE INDEX "Comment_videoId_createdAt_idx" ON "Comment" ("videoId", "createdAt");

CREATE INDEX "Comment_videoId_likes_idx" ON "Comment" ("videoId", "likes");

CREATE INDEX "Comment_userId_idx" ON "Comment" ("userId");

CREATE INDEX "Comment_parentId_idx" ON "Comment" ("parentId");

CREATE UNIQUE INDEX "UserDevice_userId_fingerprint_key" ON "UserDevice" ("userId", "fingerprint");

CREATE INDEX "UserDevice_userId_idx" ON "UserDevice" ("userId");

CREATE INDEX "UserDevice_lastActiveAt_idx" ON "UserDevice" ("lastActiveAt");

CREATE UNIQUE INDEX "CommentReaction_userId_commentId_key" ON "CommentReaction" ("userId", "commentId");

CREATE INDEX "CommentReaction_commentId_idx" ON "CommentReaction" ("commentId");

CREATE INDEX "Guestbook_createdAt_idx" ON "Guestbook" ("createdAt");

CREATE INDEX "Guestbook_likes_idx" ON "Guestbook" ("likes");

CREATE INDEX "Guestbook_userId_idx" ON "Guestbook" ("userId");

CREATE INDEX "Guestbook_parentId_idx" ON "Guestbook" ("parentId");

CREATE UNIQUE INDEX "GuestbookReaction_userId_guestbookId_key" ON "GuestbookReaction" ("userId", "guestbookId");

CREATE INDEX "GuestbookReaction_guestbookId_idx" ON "GuestbookReaction" ("guestbookId");

CREATE INDEX "SearchRecord_keyword_idx" ON "SearchRecord" ("keyword");

CREATE INDEX "SearchRecord_createdAt_idx" ON "SearchRecord" ("createdAt");

CREATE INDEX "SearchRecord_userId_idx" ON "SearchRecord" ("userId");

ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginSession" ADD CONSTRAINT "LoginSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Video" ADD CONSTRAINT "Video_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Series" ADD CONSTRAINT "Series_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeriesEpisode" ADD CONSTRAINT "SeriesEpisode_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeriesEpisode" ADD CONSTRAINT "SeriesEpisode_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TagOnVideo" ADD CONSTRAINT "TagOnVideo_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TagOnVideo" ADD CONSTRAINT "TagOnVideo_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Like" ADD CONSTRAINT "Like_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dislike" ADD CONSTRAINT "Dislike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Dislike" ADD CONSTRAINT "Dislike_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Confused" ADD CONSTRAINT "Confused_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Confused" ADD CONSTRAINT "Confused_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlaylistItem" ADD CONSTRAINT "PlaylistItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_replyToUserId_fkey" FOREIGN KEY ("replyToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Guestbook" ADD CONSTRAINT "Guestbook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Guestbook" ADD CONSTRAINT "Guestbook_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Guestbook"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Guestbook" ADD CONSTRAINT "Guestbook_replyToUserId_fkey" FOREIGN KEY ("replyToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GuestbookReaction" ADD CONSTRAINT "GuestbookReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestbookReaction" ADD CONSTRAINT "GuestbookReaction_guestbookId_fkey" FOREIGN KEY ("guestbookId") REFERENCES "Guestbook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SearchRecord" ADD CONSTRAINT "SearchRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
