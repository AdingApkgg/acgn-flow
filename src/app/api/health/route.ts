import { NextResponse } from "next/server";

// 轻量存活探针：不查库，仅确认进程能响应。
// 供 compose healthcheck 与 rathole 的 depends_on(service_healthy) 判定使用。
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
