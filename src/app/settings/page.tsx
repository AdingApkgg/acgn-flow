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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
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
import { Loader2, Upload, Link, X, Images, MapPin, Globe, AtSign } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRONOUNS_OPTIONS = [
  { value: "", label: "不设置" },
  { value: "he/him", label: "he/him" },
  { value: "she/her", label: "she/her" },
  { value: "they/them", label: "they/them" },
  { value: "he/they", label: "he/they" },
  { value: "she/they", label: "she/they" },
  { value: "any", label: "any pronouns" },
  { value: "custom", label: "自定义" },
];

const profileSchema = z.object({
  nickname: z.string().min(1, "昵称不能为空").max(50, "昵称最多50个字符"),
  bio: z.string().max(500, "简介最多500个字符").optional(),
  pronouns: z.string().max(30).optional(),
  website: z.string().url("请输入有效的URL").or(z.literal("")).optional(),
  location: z.string().max(100).optional(),
  socialLinks: z.object({
    twitter: z.string().optional(),
    github: z.string().optional(),
    discord: z.string().optional(),
    bilibili: z.string().optional(),
    youtube: z.string().optional(),
    pixiv: z.string().optional(),
  }).optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [customPronouns, setCustomPronouns] = useState(false);
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
      toast.success("个人资料已更新");
      utils.user.me.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateAvatarMutation = trpc.user.updateAvatar.useMutation({
    onSuccess: () => {
      toast.success("头像已更新");
      utils.user.me.invalidate();
      setAvatarDialogOpen(false);
      setAvatarUrl("");
      setPreviewUrl(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      bio: "",
      pronouns: "",
      website: "",
      location: "",
      socialLinks: {},
    },
  });

  useEffect(() => {
    if (user) {
      const socialLinks = (user.socialLinks as Record<string, string>) || {};
      const pronounsValue = user.pronouns || "";
      const isCustom = Boolean(pronounsValue && !PRONOUNS_OPTIONS.find(p => p.value === pronounsValue));
      setCustomPronouns(isCustom);
      
      form.reset({
        nickname: user.nickname || "",
        bio: user.bio || "",
        pronouns: pronounsValue,
        website: user.website || "",
        location: user.location || "",
        socialLinks: {
          twitter: socialLinks.twitter || "",
          github: socialLinks.github || "",
          discord: socialLinks.discord || "",
          bilibili: socialLinks.bilibili || "",
          youtube: socialLinks.youtube || "",
          pixiv: socialLinks.pixiv || "",
        },
      });
    }
  }, [user, form]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/settings");
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

    if (!["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"].includes(file.type)) {
      toast.error("请上传 JPG、PNG、GIF、WebP 或 AVIF 格式的图片");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片大小不能超过 5MB");
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "avatar");

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error || "上传失败");

      const data = await res.json();
      setAvatarUrl(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveAvatar = async () => {
    const url = avatarUrl || previewUrl;
    if (!url) return toast.error("请先选择或上传头像");
    await updateAvatarMutation.mutateAsync({ avatar: url });
  };

  if (status === "loading" || userLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-24 w-24 rounded-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!session || !user) return null;

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h2 className="text-xl font-semibold">个人资料</h2>
        <p className="text-sm text-muted-foreground mt-1">
          管理你的公开个人信息
        </p>
      </div>

      {/* 头像 */}
      <div className="flex items-start gap-6 pb-6 border-b">
        <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
          <DialogTrigger asChild>
            <button className="relative group">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage src={user.avatar || undefined} />
                <AvatarFallback className="text-2xl">
                  {(user.nickname || user.username).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-white text-xs">更换</span>
              </div>
            </button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>更换头像</DialogTitle>
              <DialogDescription>选择或上传新头像</DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="gallery" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="gallery"><Images className="h-4 w-4 mr-1.5" />选择</TabsTrigger>
                <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1.5" />上传</TabsTrigger>
                <TabsTrigger value="url"><Link className="h-4 w-4 mr-1.5" />URL</TabsTrigger>
              </TabsList>

              <TabsContent value="gallery" className="mt-4">
                <div className="flex flex-col items-center gap-4">
                  {previewUrl && (
                    <div className="relative">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={previewUrl} />
                      </Avatar>
                      <button
                        onClick={() => { setPreviewUrl(null); setAvatarUrl(""); }}
                        className="absolute -top-1 -right-1 p-0.5 bg-destructive text-white rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <ScrollArea className="h-40 w-full">
                    {avatarGallery?.length ? (
                      <div className="grid grid-cols-6 gap-2 p-1">
                        {avatarGallery.map((avatar, i) => (
                          <button
                            key={i}
                            onClick={() => { setPreviewUrl(avatar); setAvatarUrl(avatar); }}
                            className={`rounded-full overflow-hidden border-2 transition-all hover:scale-105 ${
                              previewUrl === avatar ? "border-primary" : "border-transparent"
                            }`}
                          >
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={avatar} />
                            </Avatar>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        暂无可选头像
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
                <div className="flex flex-col items-center gap-4">
                  {previewUrl ? (
                    <div className="relative">
                      <Avatar className="h-24 w-24">
                        <AvatarImage src={previewUrl} />
                      </Avatar>
                      <button
                        onClick={() => { setPreviewUrl(null); setAvatarUrl(""); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                        className="absolute -top-1 -right-1 p-0.5 bg-destructive text-white rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="h-24 w-24 rounded-full border-2 border-dashed flex items-center justify-center cursor-pointer hover:border-primary transition-colors"
                    >
                      {isUploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                  <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WebP, AVIF · 最大 5MB</p>
                </div>
              </TabsContent>

              <TabsContent value="url" className="mt-4">
                <div className="flex flex-col items-center gap-4">
                  {previewUrl && <Avatar className="h-24 w-24"><AvatarImage src={previewUrl} /></Avatar>}
                  <div className="w-full flex gap-2">
                    <Input placeholder="输入图片 URL" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} />
                    <Button variant="secondary" onClick={() => avatarUrl && setPreviewUrl(avatarUrl)}>预览</Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2 sm:gap-0">
              {user.avatar && (
                <Button variant="ghost" onClick={() => updateAvatarMutation.mutateAsync({ avatar: "" })} disabled={updateAvatarMutation.isPending} className="text-destructive">
                  移除
                </Button>
              )}
              <Button onClick={handleSaveAvatar} disabled={(!avatarUrl && !previewUrl) || updateAvatarMutation.isPending}>
                {updateAvatarMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex-1">
          <p className="font-medium">{user.nickname || user.username}</p>
          <p className="text-sm text-muted-foreground">@{user.username}</p>
          <p className="text-xs text-muted-foreground mt-2">点击头像更换，推荐使用正方形图片</p>
        </div>
      </div>

      {/* 基本信息表单 */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="nickname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>昵称</FormLabel>
                <FormControl>
                  <Input {...field} className="max-w-md" />
                </FormControl>
                <FormDescription>显示在你的个人主页和评论中</FormDescription>
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
                  <Textarea {...field} placeholder="介绍一下自己..." className="max-w-lg min-h-[100px] resize-none" />
                </FormControl>
                <FormDescription>最多 500 个字符</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2 max-w-lg">
            <FormField
              control={form.control}
              name="pronouns"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <AtSign className="h-3.5 w-3.5" />代词
                  </FormLabel>
                  {customPronouns ? (
                    <div className="flex gap-2">
                      <FormControl><Input placeholder="自定义代词" {...field} /></FormControl>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setCustomPronouns(false); field.onChange(""); }}>选择</Button>
                    </div>
                  ) : (
                    <Select value={field.value || ""} onValueChange={(v) => { if (v === "custom") { setCustomPronouns(true); field.onChange(""); } else field.onChange(v); }}>
                      <FormControl><SelectTrigger><SelectValue placeholder="选择代词" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PRONOUNS_OPTIONS.map((o) => <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />所在地
                  </FormLabel>
                  <FormControl><Input placeholder="城市、国家" {...field} /></FormControl>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />个人网站
                </FormLabel>
                <FormControl><Input placeholder="https://example.com" {...field} className="max-w-md" /></FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 社交链接 */}
          <div className="pt-4 border-t">
            <h3 className="font-medium mb-4">社交账号</h3>
            <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
              {[
                { name: "socialLinks.twitter", label: "Twitter / X", placeholder: "@username" },
                { name: "socialLinks.github", label: "GitHub", placeholder: "用户名" },
                { name: "socialLinks.discord", label: "Discord", placeholder: "用户名#1234" },
                { name: "socialLinks.bilibili", label: "哔哩哔哩", placeholder: "UID" },
                { name: "socialLinks.youtube", label: "YouTube", placeholder: "频道链接" },
                { name: "socialLinks.pixiv", label: "Pixiv", placeholder: "用户 ID" },
              ].map((item) => (
                <FormField
                  key={item.name}
                  control={form.control}
                  name={item.name as keyof ProfileForm}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm">{item.label}</FormLabel>
                      <FormControl><Input placeholder={item.placeholder} {...field} value={field.value as string || ""} /></FormControl>
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </div>

          <div className="pt-4">
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存更改
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
