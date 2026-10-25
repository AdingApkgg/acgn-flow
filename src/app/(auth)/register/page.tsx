import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { useState } from "react";

import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmailCodeInput } from "@/components/ui/email-code-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";
import { pageMeta } from "@/routes/metadata";

const registerSchema = z
  .object({
    email: z.string().email("请输入有效的邮箱地址"),
    username: z
      .string()
      .min(3, "用户名至少3个字符")
      .max(20, "用户名最多20个字符")
      .regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
    password: z.string().min(6, "密码至少6个字符"),
    confirmPassword: z.string(),
    emailCode: z.string().length(6, "请输入6位验证码"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "两次密码不一致",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const registerMutation = useMutation(
    orpc.user.register.mutationOptions({
      onSuccess: () => {
        toast.success("注册成功", { description: "请登录您的账户" });
        navigate("/login");
      },
      onError: (error) => {
        toast.error("注册失败", { description: error.message });
      },
    }),
  );

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
      await registerMutation.mutateAsync({
        email: data.email,
        code: data.emailCode,
        username: data.username,
        password: data.password,
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
              <CardTitle className="text-2xl">注册</CardTitle>
              <CardDescription>创建一个新账户</CardDescription>
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

            <div className="mt-6">
              <OAuthButtons callbackUrl="/" />
            </div>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              已有账户？{" "}
              <Link to="/login" className="text-primary hover:underline">
                立即登录
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const meta = () => pageMeta("注册", "创建一个新账户", "/register", { noindex: true });
