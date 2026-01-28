"use client";

import { useTheme } from "next-themes";
import { useVisualSettings } from "@/components/visual-settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Settings,
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useIsMounted } from "@/components/motion";

export function SettingsPanel() {
  const mounted = useIsMounted();
  const { theme, setTheme } = useTheme();
  const {
    opacity,
    blur,
    borderRadius,
    setOpacity,
    setBlur,
    setBorderRadius,
  } = useVisualSettings();

  const themeOptions = [
    { value: "system", label: "跟随系统", icon: Monitor },
    { value: "light", label: "浅色", icon: Sun },
    { value: "dark", label: "深色", icon: Moon },
  ] as const;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
          <span className="sr-only">设置</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">外观设置</h4>
          </div>

          {/* 主题切换 */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">主题</Label>
            <div className="flex gap-1">
              {themeOptions.map((option) => {
                const isActive = mounted && theme === option.value;
                return (
                  <Button
                    key={option.value}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={() => setTheme(option.value)}
                  >
                    <option.icon className="h-3.5 w-3.5" />
                    <span className="text-xs">{option.label}</span>
                    {isActive && <Check className="h-3 w-3 ml-auto" />}
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* 透明度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                页面透明度
              </Label>
              <span className="text-xs text-muted-foreground">{opacity}%</span>
            </div>
            <Slider
              value={[opacity]}
              onValueChange={([value]) => setOpacity(value)}
              min={50}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* 模糊度 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                页面模糊度
              </Label>
              <span className="text-xs text-muted-foreground">{blur}px</span>
            </div>
            <Slider
              value={[blur]}
              onValueChange={([value]) => setBlur(value)}
              min={0}
              max={20}
              step={2}
              className="w-full"
            />
          </div>

          {/* 圆角 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                页面圆角
              </Label>
              <span className="text-xs text-muted-foreground">
                {borderRadius}px
              </span>
            </div>
            <Slider
              value={[borderRadius]}
              onValueChange={([value]) => setBorderRadius(value)}
              min={0}
              max={24}
              step={4}
              className="w-full"
            />
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground text-center">
            设置会自动保存到本地
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// CSS 变量 Hook，用于应用视觉设置
export function useVisualSettingsCSS() {
  const { opacity, blur, borderRadius } = useVisualSettings();

  return {
    "--visual-opacity": opacity / 100,
    "--visual-blur": `${blur}px`,
    "--visual-radius": `${borderRadius}px`,
  } as React.CSSProperties;
}
