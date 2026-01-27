"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Sparkles, Circle, Waves, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/motion";
import { useBackgroundStore, type BackgroundType } from "@/components/three/scene-background";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const { backgroundType, setBackgroundType } = useBackgroundStore();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/settings");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="container py-6 max-w-2xl">
        <Skeleton className="h-10 w-32 mb-6" />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <PageWrapper>
      <div className="container py-6 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <Settings className="h-8 w-8" />
          <h1 className="text-2xl font-bold">网站设置</h1>
        </motion.div>

        <div className="space-y-6">
          {/* 视觉设置 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  视觉效果
                </CardTitle>
                <CardDescription>自定义背景动画效果</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-3">背景动画</p>
                    <ToggleGroup
                      type="single"
                      value={backgroundType}
                      onValueChange={(value) => {
                        if (value) setBackgroundType(value as BackgroundType);
                      }}
                      className="justify-start flex-wrap"
                    >
                      <ToggleGroupItem value="particles" aria-label="粒子效果" className="gap-2">
                        <Sparkles className="h-4 w-4" />
                        粒子
                      </ToggleGroupItem>
                      <ToggleGroupItem value="shapes" aria-label="悬浮形状" className="gap-2">
                        <Circle className="h-4 w-4" />
                        悬浮
                      </ToggleGroupItem>
                      <ToggleGroupItem value="wave" aria-label="波浪效果" className="gap-2">
                        <Waves className="h-4 w-4" />
                        波浪
                      </ToggleGroupItem>
                      <ToggleGroupItem value="none" aria-label="关闭" className="gap-2">
                        <EyeOff className="h-4 w-4" />
                        关闭
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    选择适合您的背景动画效果，关闭可提升设备性能
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
}
