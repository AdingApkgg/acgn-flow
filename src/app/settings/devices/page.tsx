"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Laptop, Smartphone, Trash2 } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { toast } from "sonner";

export default function DevicesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const utils = trpc.useUtils();
  const { data: devices, isLoading } = trpc.user.getDevices.useQuery(
    { userId: session?.user?.id || "", limit: 20 },
    { enabled: !!session?.user?.id }
  );

  const removeMutation = trpc.user.removeDevice.useMutation({
    onSuccess: () => {
      utils.user.getDevices.invalidate();
      toast.success("设备已移除");
    },
    onError: (error) => toast.error(error.message || "移除失败"),
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/settings/devices");
    }
  }, [status, router]);

  if (status === "loading" || isLoading) {
    return (
      <div className="container py-6 max-w-2xl space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="container py-6 max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">设备历史</h1>
      {!devices || devices.length === 0 ? (
        <div className="text-sm text-muted-foreground">暂无设备记录</div>
      ) : (
        devices.map((device) => {
          const isMobile = device.deviceType === "mobile" || device.deviceType === "tablet";
          const DeviceIcon = isMobile ? Smartphone : Laptop;
          return (
            <div key={device.id} className="border rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DeviceIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">
                    {device.brand || ""} {device.model || device.deviceType || "未知设备"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => removeMutation.mutate({ id: device.id })}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  移除
                </Button>
              </div>
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <div>系统：{[device.os, device.osVersion].filter(Boolean).join(" ") || "未知"}</div>
                <div>浏览器：{[device.browser, device.browserVersion].filter(Boolean).join(" ") || "未知"}</div>
                {device.ipv4Location && <div>IPv4属地：{device.ipv4Location}</div>}
                {device.ipv6Location && <div>IPv6属地：{device.ipv6Location}</div>}
                {device.gpsLocation && <div>GPS：{device.gpsLocation}</div>}
                <div>最近活跃：{formatRelativeTime(device.lastActiveAt)}</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
