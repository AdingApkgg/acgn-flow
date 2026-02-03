import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { encode } from "next-auth/jwt";

// 快速切换账号 API
// 验证 switchToken 并创建新的 session
export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "缺少令牌" }, { status: 400 });
    }

    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "fallback-secret");

    // 验证令牌
    let payload;
    try {
      const result = await jwtVerify(token, secret);
      payload = result.payload;
    } catch {
      return NextResponse.json({ error: "令牌已过期或无效" }, { status: 401 });
    }

    if (payload.type !== "switch" || !payload.sub) {
      return NextResponse.json({ error: "无效的令牌类型" }, { status: 401 });
    }

    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: payload.sub as string },
      select: {
        id: true,
        email: true,
        username: true,
        nickname: true,
        avatar: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 创建新的 session JWT
    const sessionToken = await encode({
      token: {
        sub: user.id,
        email: user.email,
        name: user.nickname || user.username,
        picture: user.avatar,
      },
      secret: process.env.AUTH_SECRET!,
      salt: process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // 设置 cookie
    const cookieStore = await cookies();
    const isProduction = process.env.NODE_ENV === "production";
    const cookieName = isProduction
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    cookieStore.set(cookieName, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.nickname || user.username,
        image: user.avatar,
      },
    });
  } catch (error) {
    console.error("Switch account error:", error);
    return NextResponse.json({ error: "切换账号失败" }, { status: 500 });
  }
}
