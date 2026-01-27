"use client";

import { useState } from "react";
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
import { motion } from "framer-motion";
import { CaptchaInput } from "@/components/ui/captcha-input";

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(6, "密码至少6个字符"),
  captcha: z.string().min(1, "请输入计算结果"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [isLoading, setIsLoading] = useState(false);

  const [captchaKey, setCaptchaKey] = useState(0);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
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
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error("登录失败", { description: "邮箱或密码错误" });
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
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card>
          <CardHeader className="text-center">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <CardTitle className="text-2xl">登录</CardTitle>
              <CardDescription>登录您的账户继续</CardDescription>
            </motion.div>
          </CardHeader>
          <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="your@email.com"
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

          <motion.div 
            className="mt-6 text-center text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            还没有账户？{" "}
            <Link href="/register" className="text-primary hover:underline">
              立即注册
            </Link>
          </motion.div>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  );
}
