"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "./input";
import { Button } from "./button";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

interface EmailCodeInputProps {
  email: string;
  type: "REGISTER" | "LOGIN" | "RESET_PASSWORD" | "CHANGE_EMAIL";
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
}

export function EmailCodeInput({
  email,
  type,
  value,
  onChange,
  disabled = false,
  error,
}: EmailCodeInputProps) {
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const sendCode = useCallback(async () => {
    if (!email || countdown > 0 || isSending) return;

    // 简单的邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("请输入有效的邮箱地址");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch("/api/email/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success("验证码已发送到您的邮箱");
        setCountdown(60);
      } else {
        toast.error(data.message || "发送失败");
      }
    } catch {
      toast.error("发送失败，请稍后重试");
    } finally {
      setIsSending(false);
    }
  }, [email, type, countdown, isSending]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="请输入6位验证码"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
            disabled={disabled}
            className="pl-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={sendCode}
          disabled={disabled || isSending || countdown > 0 || !email}
          className="min-w-[100px]"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : countdown > 0 ? (
            `${countdown}s`
          ) : (
            "发送验证码"
          )}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
