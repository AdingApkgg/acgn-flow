"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { Settings, Key, LogOut, Loader2, AlertTriangle, Sparkles, Circle, Waves, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/motion";
import { useBackgroundStore, type BackgroundType } from "@/components/three/scene-background";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(6, "新密码至少6个字符"),
    confirmPassword: z.string().min(1, "请确认新密码"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { backgroundType, setBackgroundType } = useBackgroundStore();

  const { data: user, isLoading: userLoading } = trpc.user.me.useQuery(
    undefined,
    { enabled: !!session }
  );

  const changePasswordMutation = trpc.user.changePassword.useMutation({
    onSuccess: () => {
      toast.success("密码修改成功");
      form.reset();
    },
    onError: (error) => {
      toast.error("修改失败", { description: error.message });
    },
  });

  const form = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/settings");
    }
  }, [status, router]);

  async function onSubmit(data: PasswordForm) {
    setIsLoading(true);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  if (status === "loading" || userLoading) {
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
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!session || !user) {
    return null;
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
          <h1 className="text-2xl font-bold">设置</h1>
        </motion.div>

        <div className="space-y-6">
          {/* 账号信息 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">账号信息</CardTitle>
                <CardDescription>您的基本账号信息</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">用户名</span>
                    <p className="font-medium">{user.username}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">邮箱</span>
                    <p className="font-medium">{user.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">角色</span>
                    <p className="font-medium">
                      {user.role === "ADMIN" ? "管理员" : "普通用户"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">注册时间</span>
                    <p className="font-medium">
                      {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* 修改密码 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  修改密码
                </CardTitle>
                <CardDescription>定期更换密码可以提高账号安全性</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>当前密码</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="请输入当前密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>新密码</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="请输入新密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>确认新密码</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="请再次输入新密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      修改密码
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>

          {/* 视觉设置 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
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

          <Separator />

          {/* 危险操作 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  危险操作
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">退出登录</p>
                    <p className="text-sm text-muted-foreground">
                      退出当前账号
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline">
                        <LogOut className="h-4 w-4 mr-2" />
                        退出登录
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确定要退出登录吗？</AlertDialogTitle>
                        <AlertDialogDescription>
                          退出后需要重新登录才能访问个人功能。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleLogout}>
                          确定退出
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
}
