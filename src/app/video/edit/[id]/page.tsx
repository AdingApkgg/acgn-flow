"use client";

import { use, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Form, FormLabel } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { VideoFormFields } from "@/components/video/video-form-fields";
import { TagSelector } from "@/components/video/tag-selector";

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
  const [newTags, setNewTags] = useState<string[]>([]);

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

      <Card>
        <CardHeader>
          <CardTitle>视频信息</CardTitle>
          <CardDescription>修改视频的基本信息</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* 使用共享的表单字段组件 */}
              <VideoFormFields form={form} />

              {/* 标签选择 */}
              <div className="space-y-2">
                <FormLabel>标签</FormLabel>
                <TagSelector
                  allTags={allTags}
                  selectedTags={selectedTags}
                  newTags={newTags}
                  onSelectedTagsChange={setSelectedTags}
                  onNewTagsChange={setNewTags}
                />
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
  );
}
