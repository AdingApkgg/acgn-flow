"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { VideoPlayer } from "@/components/video/video-player";
import { Eye, EyeOff, ChevronDown, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  showAdvanced?: boolean;
  onShowAdvancedChange?: (show: boolean) => void;
}

export function VideoFormFields({
  form,
  showAdvanced: controlledShowAdvanced,
  onShowAdvancedChange,
}: VideoFormFieldsProps) {
  const [internalShowAdvanced, setInternalShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const showAdvanced = controlledShowAdvanced ?? internalShowAdvanced;
  const setShowAdvanced = onShowAdvancedChange ?? setInternalShowAdvanced;

  const coverUrl = form.watch("coverUrl");
  const videoUrl = form.watch("videoUrl");

  return (
    <div className="space-y-6">
      {/* 基本信息 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 左列：标题和描述 */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>标题 *</FormLabel>
                <FormControl>
                  <Input placeholder="输入视频标题" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>简介</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="视频简介（可选）"
                    className="min-h-[120px] resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* 右列：封面预览 */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="coverUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>封面</FormLabel>
                <FormControl>
                  <Input placeholder="封面图片链接（可选）" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 封面预览 */}
          <div
            className={cn(
              "relative aspect-video rounded-lg border-2 border-dashed overflow-hidden transition-colors",
              coverUrl ? "border-transparent" : "border-muted-foreground/25"
            )}
          >
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt="封面预览"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                <span className="text-sm">封面预览</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 视频链接 */}
      <FormField
        control={form.control}
        name="videoUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>视频链接 *</FormLabel>
            <div className="flex gap-2">
              <FormControl>
                <Input placeholder="https://example.com/video.mp4" {...field} />
              </FormControl>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPreview(!showPreview)}
                disabled={!field.value}
                title={showPreview ? "隐藏预览" : "显示预览"}
              >
                {showPreview ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <FormDescription>支持 MP4, WebM, HLS (m3u8) 格式</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* 视频预览 */}
      {showPreview && videoUrl && (
        <div className="space-y-2">
          <FormLabel>视频预览</FormLabel>
          <div className="rounded-lg overflow-hidden border">
            <VideoPlayer
              url={videoUrl}
              poster={coverUrl || undefined}
              autoStart={false}
              subtitles={
                form.watch("subtitleUrl")
                  ? [
                      {
                        url: form.watch("subtitleUrl")!,
                        name: "字幕",
                        default: true,
                      },
                    ]
                  : []
              }
              danmakuUrl={form.watch("danmakuUrl") || undefined}
            />
          </div>
        </div>
      )}

      {/* 高级选项 */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between"
          >
            <span>高级选项</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                showAdvanced && "rotate-180"
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          <FormField
            control={form.control}
            name="subtitleUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>字幕链接</FormLabel>
                <FormControl>
                  <Input placeholder="https://...subtitle.vtt（可选）" {...field} />
                </FormControl>
                <FormDescription>支持 VTT、SRT、ASS 格式</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="danmakuUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>弹幕链接</FormLabel>
                <FormControl>
                  <Input placeholder="https://...danmaku.xml（可选）" {...field} />
                </FormControl>
                <FormDescription>支持 B站 XML 或 JSON 格式</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
