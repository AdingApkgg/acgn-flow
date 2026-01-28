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
import { Loader2, ArrowLeft } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { EmailCodeInput } from "@/components/ui/email-code-input";

const resetPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  emailCode: z.string().length(6, "请输入6位验证码"),
  newPassword: z.string().min(6, "密码至少6个字符"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "两次密码不一致",
  path: ["confirmPassword"],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const resetPasswordMutation = trpc.user.resetPassword.useMutation({
    onSuccess: () => {
      toast.success("密码重置成功", { description: "请使用新密码登录" });
      router.push("/login");
    },
    onError: (error) => {
      toast.error("重置失败", { description: error.message });
    },
  });

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: "",
      emailCode: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const email = form.watch("email");

  async function onSubmit(data: ResetPasswordForm) {
    setIsLoading(true);
    try {
      // 验证邮箱验证码
      const verifyRes = await fetch("/api/email/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: data.email, 
          code: data.emailCode,
          type: "RESET_PASSWORD",
        }),
      });
      const verifyResult = await verifyRes.json();

      if (!verifyResult.valid) {
        toast.error(verifyResult.message || "验证码错误");
        setIsLoading(false);
        return;
      }

      await resetPasswordMutation.mutateAsync({
        email: data.email,
        newPassword: data.newPassword,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="container flex items-center justify-center min-h-[calc(100vh-200px)] py-8">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div>
              <CardTitle className="text-2xl">重置密码</CardTitle>
              <CardDescription>通过邮箱验证码重置您的密码</CardDescription>
            </div>
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
                name="emailCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱验证码</FormLabel>
                    <FormControl>
                      <EmailCodeInput
                        email={email}
                        type="RESET_PASSWORD"
                        value={field.value}
                        onChange={field.onChange}
                        error={form.formState.errors.emailCode?.message}
                      />
                    </FormControl>
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
                    <FormLabel>确认新密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="******" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                重置密码
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center">
            <Link 
              href="/login" 
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回登录
            </Link>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
