import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { loginSession } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { parseDeviceInfo } from "@/lib/device-info";
import { getIpLocation } from "@/lib/ip-location";

export async function POST(request: Request) {
  const session = await getSession(request.headers);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const body = z
    .object({ gpsLocation: z.string().max(500).optional() })
    .safeParse(await request.json().catch(() => ({})));
  if (!body.success) return Response.json({ error: "参数错误" }, { status: 400 });
  const userAgent = request.headers.get("user-agent") || "";
  const device = parseDeviceInfo(userAgent);
  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ipv4Address = clientIp.includes(":") ? null : clientIp;
  const ipv6Address = clientIp.includes(":") ? clientIp : null;
  const [ipv4Location, ipv6Location] = await Promise.all([
    getIpLocation(ipv4Address),
    getIpLocation(ipv6Address),
  ]);
  const [row] = await db
    .insert(loginSession)
    .values({
      jti: session.jti,
      userId: session.user.id,
      deviceType: device.deviceType,
      os: device.os,
      osVersion: device.osVersion,
      browser: device.browser,
      browserVersion: device.browserVersion,
      brand: device.brand,
      model: device.model,
      userAgent,
      ipv4Address,
      ipv6Address,
      ipv4Location,
      ipv6Location,
      gpsLocation: body.data.gpsLocation,
      expiresAt: new Date(session.session.expiresAt),
    })
    .onConflictDoUpdate({
      target: loginSession.jti,
      set: {
        lastActiveAt: new Date(),
        ipv4Address,
        ipv6Address,
        ipv4Location,
        ipv6Location,
        gpsLocation: body.data.gpsLocation,
      },
    })
    .returning({ id: loginSession.id });
  return Response.json({ success: true, sessionId: row?.id });
}

export async function GET(request: Request) {
  const session = await getSession(request.headers);
  if (!session) return Response.json({ error: "未登录" }, { status: 401 });
  const row = await db.query.loginSession.findFirst({
    where: and(eq(loginSession.jti, session.jti), eq(loginSession.userId, session.user.id)),
    columns: {
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
  return Response.json({ session: row || null, jti: session.jti });
}
