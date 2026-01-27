"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { EmailCodeInput } from "@/components/ui/email-code-input";
import { OAuthButtons } from "@/components/auth/oauth-buttons";

const registerSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  username: z.string().min(3, "用户名至少3个字符").max(20, "用户名最多20个字符").regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  password: z.string().min(6, "密码至少6个字符"),
  confirmPassword: z.string(),
  emailCode: z.string().length(6, "请输入6位验证码"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const registerMutation = trpc.user.register.useMutation({
    onSuccess: () => {
      toast.success("注册成功", { description: "请登录您的账户" });
      router.push("/login");
    },
    onError: (error) => {
      toast.error("注册失败", { description: error.message });
    },
  });

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      username: "",
      password: "",
      confirmPassword: "",
      emailCode: "",
    },
  });

  const email = form.watch("email");

  async function onSubmit(data: RegisterForm) {
    setIsLoading(true);
    try {
      // 验证邮箱验证码
      const verifyRes = await fetch("/api/email/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: data.email, 
          code: data.emailCode,
          type: "REGISTER",
        }),
      });
      const verifyResult = await verifyRes.json();

      if (!verifyResult.valid) {
        toast.error(verifyResult.message || "验证码错误");
        setIsLoading(false);
        return;
      }

      await registerMutation.mutateAsync({
        email: data.email,
        username: data.username,
        password: data.password,
      });
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
              <CardTitle className="text-2xl">注册</CardTitle>
              <CardDescription>创建一个新账户</CardDescription>
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
                      <Input type="email" placeholder="your@email.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input placeholder="username" {...field} />
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
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>确认密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="******" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="emailCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱验证码</FormLabel>
                    <FormControl>
                      <EmailCodeInput
                        email={email}
                        type="REGISTER"
                        value={field.value}
                        onChange={field.onChange}
                        error={form.formState.errors.emailCode?.message}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                注册
              </Button>
            </form>
          </Form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6"
          >
            <OAuthButtons callbackUrl="/" />
          </motion.div>

          <motion.div 
            className="mt-6 text-center text-sm text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            已有账户？{" "}
            <Link href="/login" className="text-primary hover:underline">
              立即登录
            </Link>
          </motion.div>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  );
}
