import { RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { useIsMounted } from "@/components/motion";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

interface CaptchaInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function CaptchaInput({ value, onChange, error }: CaptchaInputProps) {
  const mounted = useIsMounted();
  const [captchaKey, setCaptchaKey] = useState<number>(() => Date.now());

  const refreshCaptcha = useCallback(() => {
    setCaptchaKey(Date.now());
    onChange("");
  }, [onChange]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Input
          type="text"
          placeholder="计算结果"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
          maxLength={5}
          autoComplete="off"
        />
        <div className="flex items-center gap-2">
          {mounted && captchaKey ? (
            <button type="button" onClick={refreshCaptcha} aria-label="刷新验证码">
              <img
                src={`/api/captcha?t=${captchaKey}`}
                alt="验证码"
                className="h-10 rounded border cursor-pointer"
                title="点击刷新验证码"
              />
            </button>
          ) : (
            <Skeleton className="h-10 w-[120px] rounded" />
          )}
          <button
            type="button"
            onClick={refreshCaptcha}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="刷新验证码"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
