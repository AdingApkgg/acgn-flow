import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseDeviceInfo } from "@/lib/device-info";
import { getIpLocation } from "@/lib/ip-location";

// 记录/更新登录会话信息
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id || !session.jti) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { gpsLocation } = body;

    // 获取设备信息
    const userAgent = request.headers.get("user-agent") || "";
    const deviceInfo = parseDeviceInfo(userAgent);

    // 获取 IP 地址
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const clientIp = forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
    
    // 分离 IPv4 和 IPv6
    let ipv4Address: string | null = null;
    let ipv6Address: string | null = null;
    
    if (clientIp.includes(":")) {
      ipv6Address = clientIp;
    } else {
      ipv4Address = clientIp;
    }

    // 获取 IP 地理位置
    const ipv4Location = await getIpLocation(ipv4Address);
    const ipv6Location = await getIpLocation(ipv6Address);

    // 计算过期时间（30天）
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 创建或更新登录会话
    const loginSession = await prisma.loginSession.upsert({
      where: { jti: session.jti },
      create: {
        jti: session.jti,
        userId: session.user.id,
        deviceType: deviceInfo.deviceType,
        os: deviceInfo.os,
        osVersion: deviceInfo.osVersion,
        browser: deviceInfo.browser,
        browserVersion: deviceInfo.browserVersion,
        brand: deviceInfo.brand,
        model: deviceInfo.model,
        userAgent,
        ipv4Address,
        ipv4Location,
        ipv6Address,
        ipv6Location,
        gpsLocation,
        expiresAt,
      },
      update: {
        lastActiveAt: new Date(),
        // 更新 IP 信息（用户可能换了网络）
        ipv4Address,
        ipv4Location,
        ipv6Address,
        ipv6Location,
        gpsLocation: gpsLocation || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: loginSession.id,
    });
  } catch (error) {
    console.error("Session info error:", error);
    return NextResponse.json({ error: "记录会话失败" }, { status: 500 });
  }
}

// 获取当前会话信息
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id || !session.jti) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const loginSession = await prisma.loginSession.findUnique({
      where: { jti: session.jti },
      select: {
        id: true,
        deviceType: true,
        os: true,
        browser: true,
        ipv4Location: true,
        ipv6Location: true,
        createdAt: true,
        lastActiveAt: true,
      },
    });

    return NextResponse.json({
      session: loginSession,
      jti: session.jti,
    });
  } catch (error) {
    console.error("Get session info error:", error);
    return NextResponse.json({ error: "获取会话失败" }, { status: 500 });
  }
}
