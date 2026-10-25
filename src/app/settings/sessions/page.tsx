import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Laptop, LogOut, MapPin, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/auth-client";
import { formatRelativeTime } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { pageMeta } from "@/routes/metadata";

export default function SessionsPage() {
  const { data: session, status } = useSession();
  const navigate = useNavigate();
  const [hasRecorded, setHasRecorded] = useState(false);

  const queryClient = useQueryClient();

  const { data: sessionsData, isLoading: isLoadingSessions } = useQuery(
    orpc.user.getLoginSessions.queryOptions({
      input: { limit: 20 },
      ...{ enabled: !!session?.user?.id },
    }),
  );

  const { data: devices, isLoading: isLoadingDevices } = useQuery(
    orpc.user.getDevices.queryOptions({
      input: { userId: session?.user?.id || "", limit: 10 },
      ...{ enabled: !!session?.user?.id },
    }),
  );

  const revokeMutation = useMutation(
    orpc.user.revokeLoginSession.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.user.getLoginSessions.key() });
        toast.success("已撤销该会话");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const revokeAllMutation = useMutation(
    orpc.user.revokeAllOtherSessions.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: orpc.user.getLoginSessions.key() });
        toast.success(`已撤销 ${data.count} 个会话`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const removeDeviceMutation = useMutation(
    orpc.user.removeDevice.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: orpc.user.getDevices.key() });
        toast.success("设备记录已移除");
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  // 记录当前会话信息
  useEffect(() => {
    if (session?.jti && !hasRecorded) {
      fetch("/api/auth/session-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
        .then(() => {
          setHasRecorded(true);
          queryClient.invalidateQueries({ queryKey: orpc.user.getLoginSessions.key() });
        })
        .catch(console.error);
    }
  }, [session?.jti, hasRecorded, queryClient]);

  useEffect(() => {
    if (status === "unauthenticated") {
      navigate("/login?callbackUrl=/settings/sessions");
    }
  }, [status, navigate]);

  if (status === "loading" || isLoadingSessions) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!session) return null;

  const sessions = sessionsData?.sessions || [];
  const currentJti = sessionsData?.currentJti;
  const otherSessions = sessions.filter((s) => s.jti !== currentJti);

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">登录管理</h2>
          <p className="text-sm text-muted-foreground mt-1">管理你的登录设备和会话</p>
        </div>

        {otherSessions.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive shrink-0">
                <LogOut className="h-4 w-4 mr-1.5" />
                登出其他设备
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认登出所有其他设备？</AlertDialogTitle>
                <AlertDialogDescription>
                  这将撤销除当前设备外的所有 {otherSessions.length}{" "}
                  个登录会话。被撤销的设备需要重新登录。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => revokeAllMutation.mutate(undefined)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  确认登出
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {/* 活跃会话 */}
      <div>
        <h3 className="font-medium mb-3">活跃会话</h3>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">暂无登录会话记录</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((loginSession) => {
              const isMobile =
                loginSession.deviceType === "mobile" || loginSession.deviceType === "tablet";
              const DeviceIcon = isMobile ? Smartphone : Laptop;
              const isCurrent = loginSession.jti === currentJti;
              const location =
                loginSession.ipv4Location || loginSession.ipv6Location || loginSession.gpsLocation;

              return (
                <div
                  key={loginSession.id}
                  className={`flex items-start gap-4 p-4 rounded-lg border ${isCurrent ? "border-primary/30 bg-primary/5" : "bg-card"}`}
                >
                  <div className={`p-2 rounded-lg ${isCurrent ? "bg-primary/10" : "bg-muted"}`}>
                    <DeviceIcon
                      className={`h-5 w-5 ${isCurrent ? "text-primary" : "text-muted-foreground"}`}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {loginSession.brand || ""}{" "}
                        {loginSession.model || loginSession.deviceType || "未知设备"}
                      </span>
                      {isCurrent && (
                        <Badge variant="default" className="text-xs">
                          当前
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {[loginSession.os, loginSession.osVersion].filter(Boolean).join(" ")}
                      {" · "}
                      {[loginSession.browser, loginSession.browserVersion]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(loginSession.createdAt)}
                      </span>
                    </div>
                  </div>

                  {!isCurrent && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>撤销此会话？</AlertDialogTitle>
                          <AlertDialogDescription>
                            该设备将被登出，需要重新登录才能访问账号。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>取消</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeMutation.mutate({ id: loginSession.id })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            撤销会话
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 设备历史 */}
      <div className="pt-4 border-t">
        <h3 className="font-medium mb-1">设备历史</h3>
        <p className="text-sm text-muted-foreground mb-4">曾经登录过的设备记录</p>

        {isLoadingDevices ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : !devices?.length ? (
          <p className="text-sm text-muted-foreground py-4">暂无设备历史</p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => {
              const isMobile = device.deviceType === "mobile" || device.deviceType === "tablet";
              const DeviceIcon = isMobile ? Smartphone : Laptop;
              const location = device.ipv4Location || device.ipv6Location || device.gpsLocation;

              return (
                <div
                  key={device.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card text-sm"
                >
                  <DeviceIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span>
                      {device.brand || ""} {device.model || device.deviceType || "未知设备"}
                    </span>
                    <span className="text-muted-foreground"> · {device.browser}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    {location && <span>{location}</span>}
                    <span>{formatRelativeTime(device.lastActiveAt)}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeDeviceMutation.mutate({ id: device.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 安全提示 */}
      <div className="flex items-start gap-3 p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-yellow-600">安全提示</p>
          <p className="text-muted-foreground mt-1">
            如果发现不认识的登录会话，请立即撤销并修改密码。定期检查登录设备可以帮助保护账号安全。
          </p>
        </div>
      </div>
    </div>
  );
}

export const meta = () =>
  pageMeta("登录管理", "管理登录会话与设备", "/settings/sessions", { noindex: true });
