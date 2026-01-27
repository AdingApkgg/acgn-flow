"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Camera, Upload, Link, X, Images } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const profileSchema = z.object({
  nickname: z.string().min(1, "昵称不能为空").max(50, "昵称最多50个字符"),
  bio: z.string().max(500, "简介最多500个字符").optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const { data: user, isLoading: userLoading } = trpc.user.me.useQuery(
    undefined,
    { enabled: !!session }
  );

  const { data: avatarGallery } = trpc.user.getAvatarGallery.useQuery(
    undefined,
    { enabled: !!session && avatarDialogOpen }
  );

  const updateMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("资料更新成功");
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const updateAvatarMutation = trpc.user.updateAvatar.useMutation({
    onSuccess: () => {
      toast.success("头像更新成功");
      utils.user.me.invalidate();
      setAvatarDialogOpen(false);
      setAvatarUrl("");
      setPreviewUrl(null);
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      bio: "",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        nickname: user.nickname || "",
        bio: user.bio || "",
      });
    }
  }, [user, form]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/profile");
    }
  }, [status, router]);

  async function onSubmit(data: ProfileForm) {
    setIsLoading(true);
    try {
      await updateMutation.mutateAsync(data);
    } finally {
      setIsLoading(false);
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 检查文件类型
    if (!["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(file.type)) {
      toast.error("请上传 JPG、PNG、GIF、WebP 或 AVIF 格式的图片");
      return;
    }

    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      return;
    }

    // 显示预览
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // 上传文件
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "avatar");

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "上传失败");
      }

      const data = await res.json();
      setAvatarUrl(data.url);
      toast.success("图片上传成功，点击保存确认");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (!avatarUrl.trim()) {
      toast.error("请输入头像URL");
      return;
    }

    try {
      new URL(avatarUrl);
    } catch {
      toast.error("请输入有效的URL");
      return;
    }

    setPreviewUrl(avatarUrl);
  };

  const handleSaveAvatar = async () => {
    const url = avatarUrl || previewUrl;
    if (!url) {
      toast.error("请先选择或上传头像");
      return;
    }
    await updateAvatarMutation.mutateAsync({ avatar: url });
  };

  const handleRemoveAvatar = async () => {
    await updateAvatarMutation.mutateAsync({ avatar: "" });
  };

  if (status === "loading" || userLoading) {
    return (
      <div className="container py-6 max-w-2xl">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-20 rounded-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session || !user) {
    return null;
  }

  return (
    <div className="container py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>个人资料</CardTitle>
          <CardDescription>管理您的个人信息</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
              <DialogTrigger asChild>
                <div className="relative group cursor-pointer">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={user.avatar || undefined} />
                    <AvatarFallback className="text-2xl">
                      {(user.nickname || user.username).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </div>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>更换头像</DialogTitle>
                  <DialogDescription>
                    上传图片或使用 URL 设置新头像
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="gallery" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="gallery">
                      <Images className="h-4 w-4 mr-2" />
                      选择
                    </TabsTrigger>
                    <TabsTrigger value="upload">
                      <Upload className="h-4 w-4 mr-2" />
                      上传
                    </TabsTrigger>
                    <TabsTrigger value="url">
                      <Link className="h-4 w-4 mr-2" />
                      URL
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="gallery" className="space-y-4">
                    <div className="flex flex-col items-center gap-4 py-4">
                      {previewUrl && (
                        <div className="relative">
                          <Avatar className="h-24 w-24">
                            <AvatarImage src={previewUrl} />
                            <AvatarFallback>预览</AvatarFallback>
                          </Avatar>
                          <button
                            onClick={() => {
                              setPreviewUrl(null);
                              setAvatarUrl("");
                            }}
                            className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                      <ScrollArea className="h-48 w-full">
                        {avatarGallery && avatarGallery.length > 0 ? (
                          <div className="grid grid-cols-5 gap-2 p-1">
                            {avatarGallery.map((avatar, index) => (
                              <button
                                key={index}
                                onClick={() => {
                                  setPreviewUrl(avatar);
                                  setAvatarUrl(avatar);
                                }}
                                className={`relative rounded-full overflow-hidden border-2 transition-all hover:scale-105 ${
                                  previewUrl === avatar
                                    ? "border-primary ring-2 ring-primary/50"
                                    : "border-transparent hover:border-muted-foreground/50"
                                }`}
                              >
                                <Avatar className="h-14 w-14">
                                  <AvatarImage src={avatar} />
                                  <AvatarFallback>头像</AvatarFallback>
                                </Avatar>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground">
                            暂无可选头像，请上传或使用 URL
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </TabsContent>

                  <TabsContent value="upload" className="space-y-4">
                    <div className="flex flex-col items-center gap-4 py-4">
                      {previewUrl ? (
                        <div className="relative">
                          <Avatar className="h-32 w-32">
                            <AvatarImage src={previewUrl} />
                            <AvatarFallback>预览</AvatarFallback>
                          </Avatar>
                          <button
                            onClick={() => {
                              setPreviewUrl(null);
                              setAvatarUrl("");
                              if (fileInputRef.current) {
                                fileInputRef.current.value = "";
                              }
                            }}
                            className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="h-32 w-32 rounded-full border-2 border-dashed border-muted-foreground/50 flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                        >
                          {isUploading ? (
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                          ) : (
                            <Upload className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      <p className="text-sm text-muted-foreground">
                        支持 JPG、PNG、GIF、WebP、AVIF，最大 5MB
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="url" className="space-y-4">
                    <div className="flex flex-col items-center gap-4 py-4">
                      {previewUrl && (
                        <Avatar className="h-32 w-32">
                          <AvatarImage src={previewUrl} />
                          <AvatarFallback>预览</AvatarFallback>
                        </Avatar>
                      )}
                      <div className="w-full flex gap-2">
                        <Input
                          placeholder="输入图片 URL"
                          value={avatarUrl}
                          onChange={(e) => setAvatarUrl(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleUrlSubmit}
                        >
                          预览
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                  {user.avatar && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleRemoveAvatar}
                      disabled={updateAvatarMutation.isPending}
                      className="text-destructive"
                    >
                      移除头像
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={handleSaveAvatar}
                    disabled={(!avatarUrl && !previewUrl) || updateAvatarMutation.isPending}
                  >
                    {updateAvatarMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    保存头像
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div>
              <p className="font-medium">{user.username}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <p className="text-xs text-muted-foreground mt-1">点击头像更换</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="nickname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>昵称</FormLabel>
                    <FormControl>
                      <Input placeholder="您的昵称" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>个人简介</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="介绍一下自己..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存更改
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
