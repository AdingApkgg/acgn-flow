import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { UserPageClient } from "./client";
import { cache } from "react";

interface UserPageProps {
  params: Promise<{ id: string }>;
}

// 使用 React cache 避免重复查询
const getUser = cache(async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      nickname: true,
      avatar: true,
      bio: true,
      pronouns: true,
      location: true,
      website: true,
      socialLinks: true,
      createdAt: true,
      _count: {
        select: {
          videos: true,
          likes: true,
          favorites: true,
        },
      },
    },
  });
});

// 动态生成 metadata
export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const { id } = await params;
  const user = await getUser(id);

  if (!user) {
    return {
      title: "用户不存在",
      description: "该用户可能已被删除或不存在",
    };
  }

  const displayName = user.nickname || user.username;
  const description = user.bio 
    ? user.bio.slice(0, 160) 
    : `${displayName} 的个人主页，已发布 ${user._count.videos} 个视频`;

  const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";

  return {
    title: displayName,
    description,
    openGraph: {
      type: "profile",
      title: `${displayName} - ${siteName}`,
      description,
      url: `${baseUrl}/user/${id}`,
      images: user.avatar ? [
        {
          url: user.avatar,
          width: 200,
          height: 200,
          alt: displayName,
        },
      ] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${displayName} - ${siteName}`,
      description,
      images: user.avatar ? [user.avatar] : undefined,
    },
  };
}

// 序列化用户数据
function serializeUser(user: NonNullable<Awaited<ReturnType<typeof getUser>>>) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    nickname: user.nickname,
    avatar: user.avatar,
    bio: user.bio,
    pronouns: user.pronouns,
    location: user.location,
    website: user.website,
    socialLinks: user.socialLinks as Record<string, string> | null,
    createdAt: user.createdAt.toISOString(),
    _count: user._count,
  };
}

export type SerializedUser = ReturnType<typeof serializeUser>;

export default async function UserPage({ params }: UserPageProps) {
  const { id } = await params;
  const user = await getUser(id);

  // 服务端预取用户数据
  const initialUser = user ? serializeUser(user) : null;

  return <UserPageClient id={id} initialUser={initialUser} />;
}
