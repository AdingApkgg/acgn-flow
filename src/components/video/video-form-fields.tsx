"use client";

import { useState, useRef } from "react";
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
import { Eye, EyeOff, ChevronDown, Image as ImageIcon, Upload, Loader2, FileText, MessageSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingSubtitle, setUploadingSubtitle] = useState(false);
  const [uploadingDanmaku, setUploadingDanmaku] = useState(false);
  
  const coverInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const danmakuInputRef = useRef<HTMLInputElement>(null);

  const showAdvanced = controlledShowAdvanced ?? internalShowAdvanced;
  const setShowAdvanced = onShowAdvancedChange ?? setInternalShowAdvanced;

  const coverUrl = form.watch("coverUrl");
  const videoUrl = form.watch("videoUrl");
  
  // 通用文件上传处理
  const handleFileUpload = async (
    file: File,
    type: "cover" | "subtitle" | "danmaku",
    setLoading: (loading: boolean) => void
  ) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", type);
      
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "上传失败");
      }
      
      // 设置表单值
      if (type === "cover") {
        form.setValue("coverUrl", data.url);
        toast.success("封面上传成功", {
          description: `格式: ${data.format}, 压缩: ${data.compressionRatio}`,
        });
      } else if (type === "subtitle") {
        form.setValue("subtitleUrl", data.url);
        toast.success("字幕上传成功");
      } else if (type === "danmaku") {
        form.setValue("danmakuUrl", data.url);
        toast.success("弹幕上传成功");
      }
    } catch (error) {
      toast.error("上传失败", {
        description: error instanceof Error ? error.message : "请稍后重试",
      });
    } finally {
      setLoading(false);
    }
  };

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

        {/* 右列：封面预览和上传 */}
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="coverUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>封面</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input placeholder="封面图片链接（可选）" {...field} />
                  </FormControl>
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file, "cover", setUploadingCover);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => coverInputRef.current?.click()}
                    disabled={uploadingCover}
                    title="上传封面"
                  >
                    {uploadingCover ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <FormDescription>自动转换为 AVIF 无损压缩</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 封面预览 */}
          <div
            className={cn(
              "relative aspect-video rounded-lg border-2 border-dashed overflow-hidden transition-colors cursor-pointer group",
              coverUrl ? "border-transparent" : "border-muted-foreground/25 hover:border-primary/50"
            )}
            onClick={() => !coverUrl && coverInputRef.current?.click()}
          >
            {coverUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverUrl}
                  alt="封面预览"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
                {/* 清除按钮 */}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    form.setValue("coverUrl", "");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                {uploadingCover ? (
                  <Loader2 className="h-12 w-12 mb-2 animate-spin opacity-50" />
                ) : (
                  <ImageIcon className="h-12 w-12 mb-2 opacity-50" />
                )}
                <span className="text-sm">{uploadingCover ? "上传中..." : "点击上传或拖入封面"}</span>
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
          {/* 字幕上传 */}
          <FormField
            control={form.control}
            name="subtitleUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  字幕文件
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input placeholder="字幕链接或上传文件（可选）" {...field} />
                  </FormControl>
                  <input
                    ref={subtitleInputRef}
                    type="file"
                    accept=".vtt,.srt,.ass,.ssa"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file, "subtitle", setUploadingSubtitle);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => subtitleInputRef.current?.click()}
                    disabled={uploadingSubtitle}
                    title="上传字幕"
                  >
                    {uploadingSubtitle ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </Button>
                  {field.value && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => form.setValue("subtitleUrl", "")}
                      title="清除"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <FormDescription>支持 VTT、SRT、ASS 格式</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 弹幕上传 */}
          <FormField
            control={form.control}
            name="danmakuUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  弹幕文件
                </FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input placeholder="弹幕链接或上传文件（可选）" {...field} />
                  </FormControl>
                  <input
                    ref={danmakuInputRef}
                    type="file"
                    accept=".xml,.json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file, "danmaku", setUploadingDanmaku);
                      }
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => danmakuInputRef.current?.click()}
                    disabled={uploadingDanmaku}
                    title="上传弹幕"
                  >
                    {uploadingDanmaku ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                  </Button>
                  {field.value && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => form.setValue("danmakuUrl", "")}
                      title="清除"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
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
