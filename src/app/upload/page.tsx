"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Upload, X, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import { motion } from "framer-motion";

const uploadSchema = z.object({
  title: z.string().min(1, "请输入标题").max(100, "标题最多100个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  videoUrl: z.string().url("请输入有效的视频URL"),
});

type UploadForm = z.infer<typeof uploadSchema>;

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [newTags, setNewTags] = useState<string[]>([]);

  const { data: allTags } = trpc.tag.list.useQuery({ limit: 100 });
  
  const createMutation = trpc.video.create.useMutation({
    onSuccess: (video) => {
      toast.success("视频发布成功");
      router.push(`/video/${video.id}`);
    },
    onError: (error) => {
      toast.error("发布失败", { description: error.message });
    },
  });

  const form = useForm<UploadForm>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      description: "",
      coverUrl: "",
      videoUrl: "",
    },
  });

  const handleAddNewTag = () => {
    const tag = newTagInput.trim();
    if (tag && !newTags.includes(tag)) {
      setNewTags([...newTags, tag]);
      setNewTagInput("");
    }
  };

  const handleRemoveNewTag = (tag: string) => {
    setNewTags(newTags.filter((t) => t !== tag));
  };

  const handleToggleExistingTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      setSelectedTags(selectedTags.filter((id) => id !== tagId));
    } else {
      setSelectedTags([...selectedTags, tagId]);
    }
  };

  async function onSubmit(data: UploadForm) {
    setIsLoading(true);
    try {
      await createMutation.mutateAsync({
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl || "",
        videoUrl: data.videoUrl,
        tagIds: selectedTags,
        tagNames: newTags,
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="container py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container py-12 text-center">
        <h1 className="text-2xl font-bold">请先登录</h1>
        <p className="text-muted-foreground mt-2">登录后才能发布视频</p>
        <Button asChild className="mt-4">
          <Link href="/login?callbackUrl=/upload">去登录</Link>
        </Button>
      </div>
    );
  }

  return (
    <motion.div 
      className="container py-6 max-w-2xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            发布视频
          </CardTitle>
          <CardDescription>
            填写视频信息，提供视频直链即可发布
          </CardDescription>
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
                      <Input placeholder="输入视频标题" {...field} />
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
                    <FormControl>
                      <Input
                        placeholder="https://example.com/video.mp4"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      支持 .mp4, .webm, .m3u8 格式
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="coverUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>封面链接 (可选)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/cover.jpg"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      不填则显示为默认封面
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
                    {selectedTags.map((tagId) => {
                      const tag = allTags?.find((t) => t.id === tagId);
                      return tag ? (
                        <Badge
                          key={tagId}
                          variant="default"
                          className="cursor-pointer"
                          onClick={() => handleToggleExistingTag(tagId)}
                        >
                          {tag.name}
                          <X className="h-3 w-3 ml-1" />
                        </Badge>
                      ) : null;
                    })}
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
                    {allTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant={selectedTags.includes(tag.id) ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => handleToggleExistingTag(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>简介</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="输入视频简介..."
                        className="min-h-[120px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                发布视频
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
