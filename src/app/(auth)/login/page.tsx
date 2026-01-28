"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CaptchaInput } from "@/components/ui/captcha-input";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Skeleton } from "@/components/ui/skeleton";

const loginSchema = z.object({
  identifier: z.string().min(1, "请输入邮箱或用户名"),
  password: z.string().min(6, "密码至少6个字符"),
  captcha: z.string().min(1, "请输入计算结果"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const prefillAccount = searchParams.get("account") || "";
  const isNewAccount = searchParams.get("new") === "1";
  const [isLoading, setIsLoading] = useState(false);

  const [captchaKey, setCaptchaKey] = useState(0);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: prefillAccount,
      password: "",
      captcha: "",
    },
  });

  async function onSubmit(data: LoginForm) {
    setIsLoading(true);
    try {
      // 验证验证码
      const captchaRes = await fetch("/api/captcha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captcha: data.captcha }),
      });
      const captchaResult = await captchaRes.json();

      if (!captchaResult.valid) {
        toast.error("验证码错误");
        setCaptchaKey((k) => k + 1);
        form.setValue("captcha", "");
        setIsLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        identifier: data.identifier,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("登录失败", { description: "账号或密码错误" });
        setCaptchaKey((k) => k + 1);
        form.setValue("captcha", "");
      } else {
        toast.success("登录成功");
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      toast.error("登录失败", { description: "发生未知错误" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="container flex items-center justify-center min-h-[calc(100vh-200px)] py-8">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card>
          <CardHeader className="text-center">
            <div>
              <CardTitle className="text-2xl">
                {isNewAccount ? "添加账号" : prefillAccount ? "切换账号" : "登录"}
              </CardTitle>
              <CardDescription>
                {isNewAccount 
                  ? "登录其他账号以添加到账号列表" 
                  : prefillAccount 
                  ? "请输入密码以切换账号" 
                  : "登录您的账户继续"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱或用户名</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="邮箱或用户名"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="******" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="captcha"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>验证码</FormLabel>
                    <FormControl>
                      <CaptchaInput
                        key={captchaKey}
                        value={field.value}
                        onChange={field.onChange}
                        error={form.formState.errors.captcha?.message}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                登录
              </Button>
            </form>
          </Form>

          <div className="mt-6">
            <OAuthButtons callbackUrl={callbackUrl} />
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground space-y-2">
            <div>
              <Link href="/forgot-password" className="text-primary hover:underline">
                忘记密码？
              </Link>
            </div>
            <div>
              还没有账户？{" "}
              <Link href="/register" className="text-primary hover:underline">
                立即注册
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="container flex items-center justify-center min-h-[calc(100vh-200px)] py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Skeleton className="h-8 w-24 mx-auto" />
          <Skeleton className="h-4 w-40 mx-auto mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}
