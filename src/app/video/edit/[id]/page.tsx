"use client";

import { use, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, ArrowLeft, X, Plus, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { VideoPlayer } from "@/components/video/video-player";

const editSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(100, "标题最多100个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  videoUrl: z.string().url("请输入有效的视频URL"),
  subtitleUrl: z.string().url("请输入有效的字幕URL").optional().or(z.literal("")),
  danmakuUrl: z.string().url("请输入有效的弹幕URL").optional().or(z.literal("")),
});

type EditForm = z.infer<typeof editSchema>;

interface EditVideoPageProps {
  params: Promise<{ id: string }>;
}

export default function EditVideoPage({ params }: EditVideoPageProps) {
  const { id } = use(params);
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTags, setSelectedTags] = useState<{ id: string; name: string }[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const { data: video, isLoading: videoLoading } = trpc.video.getForEdit.useQuery(
    { id },
    { enabled: !!session }
  );

  const { data: allTags } = trpc.tag.list.useQuery({});

  const updateMutation = trpc.video.update.useMutation({
    onSuccess: () => {
      toast.success("视频更新成功");
      router.push("/my-videos");
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: "",
      description: "",
      coverUrl: "",
      videoUrl: "",
      subtitleUrl: "",
      danmakuUrl: "",
    },
  });

  useEffect(() => {
    if (video) {
      form.reset({
        title: video.title,
        description: video.description || "",
        coverUrl: video.coverUrl || "",
        videoUrl: video.videoUrl,
        subtitleUrl: video.subtitleUrl || "",
        danmakuUrl: video.danmakuUrl || "",
      });
      setSelectedTags(video.tags.map((t) => ({ id: t.tag.id, name: t.tag.name })));
    }
  }, [video, form]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login?callbackUrl=/video/edit/" + id);
    }
  }, [authStatus, router, id]);

  async function onSubmit(data: EditForm) {
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        id,
        title: data.title,
        description: data.description || undefined,
        coverUrl: data.coverUrl || undefined,
        videoUrl: data.videoUrl,
        subtitleUrl: data.subtitleUrl || undefined,
        danmakuUrl: data.danmakuUrl || undefined,
        tagIds: selectedTags.map((t) => t.id),
        tagNames: newTags,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleAddNewTag = () => {
    const tag = newTagInput.trim();
    if (tag && !newTags.includes(tag) && !selectedTags.some((t) => t.name === tag)) {
      setNewTags([...newTags, tag]);
      setNewTagInput("");
    }
  };

  const handleRemoveNewTag = (tag: string) => {
    setNewTags(newTags.filter((t) => t !== tag));
  };

  const toggleTag = (tag: { id: string; name: string }) => {
    setSelectedTags((prev) => {
      const exists = prev.find((t) => t.id === tag.id);
      if (exists) {
        return prev.filter((t) => t.id !== tag.id);
      }
      return [...prev, tag];
    });
  };

  if (authStatus === "loading" || videoLoading) {
    return (
      <div className="container py-6 max-w-3xl">
        <Skeleton className="h-10 w-48 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session || !video) {
    return null;
  }

  return (
    <div className="container py-6 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/my-videos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">编辑视频</h1>
      </div>

      <div>
          <Card>
            <CardHeader>
              <CardTitle>视频信息</CardTitle>
              <CardDescription>修改视频的基本信息</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>标题 *</FormLabel>
                        <FormControl>
                          <Input placeholder="视频标题" {...field} />
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
                            placeholder="视频简介..."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="videoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>视频链接 *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input placeholder="https://..." {...field} />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setShowPreview(!showPreview)}
                            disabled={!field.value}
                          >
                            {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                        <FormDescription>
                          支持直链、HLS 等格式
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 视频预览 */}
                  {showPreview && form.watch("videoUrl") && (
                    <div className="space-y-2">
                      <FormLabel>视频预览</FormLabel>
                      <VideoPlayer
                        url={form.watch("videoUrl")}
                        poster={form.watch("coverUrl") || undefined}
                        autoStart={false}
                        subtitles={form.watch("subtitleUrl") ? [{ url: form.watch("subtitleUrl")!, name: "字幕", default: true }] : []}
                        danmakuUrl={form.watch("danmakuUrl") || undefined}
                      />
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="coverUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>封面链接</FormLabel>
                        <FormControl>
                          <Input placeholder="https://... (可选)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subtitleUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>字幕链接</FormLabel>
                        <FormControl>
                          <Input placeholder="https://...subtitle.vtt (可选)" {...field} />
                        </FormControl>
                        <FormDescription>
                          支持 VTT、SRT、ASS 格式
                        </FormDescription>
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
                          <Input placeholder="https://...danmaku.xml (可选)" {...field} />
                        </FormControl>
                        <FormDescription>
                          支持 B站 XML 或 JSON 格式
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 标签选择 */}
                  <div className="space-y-3">
                    <FormLabel>标签</FormLabel>
                    
                    {/* 已选标签 */}
                    {(selectedTags.length > 0 || newTags.length > 0) && (
                      <div className="flex flex-wrap gap-2">
                        {selectedTags.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant="default"
                            className="cursor-pointer"
                            onClick={() => toggleTag(tag)}
                          >
                            {tag.name}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        ))}
                        {newTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="cursor-pointer"
                            onClick={() => handleRemoveNewTag(tag)}
                          >
                            {tag} (新)
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* 添加新标签 */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="输入新标签"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddNewTag();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={handleAddNewTag}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* 已有标签列表 */}
                    {allTags && allTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 border rounded-md">
                        {allTags.map((tag) => {
                          const isSelected = selectedTags.some((t) => t.id === tag.id);
                          return (
                            <Badge
                              key={tag.id}
                              variant={isSelected ? "default" : "outline"}
                              className="cursor-pointer text-xs"
                              onClick={() => toggleTag({ id: tag.id, name: tag.name })}
                            >
                              {tag.name}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      保存更改
                    </Button>
                    <Button type="button" variant="outline" asChild>
                      <Link href="/my-videos">取消</Link>
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
