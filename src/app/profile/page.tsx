"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Camera, Upload, Link, X, Images, MapPin, Globe, AtSign, User, Key, LogOut, AlertTriangle, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from "framer-motion";
import { PageWrapper } from "@/components/motion";

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

const accountSchema = z.object({
  username: z.string().min(3, "用户名至少3个字符").max(20, "用户名最多20个字符").regex(/^[a-zA-Z0-9_]+$/, "用户名只能包含字母、数字和下划线"),
  email: z.string().email("请输入有效的邮箱地址"),
});

type AccountForm = z.infer<typeof accountSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "请输入当前密码"),
    newPassword: z.string().min(6, "新密码至少6个字符"),
    confirmPassword: z.string().min(1, "请确认新密码"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  });

type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isAccountLoading, setIsAccountLoading] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
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

  const updateAccountMutation = trpc.user.updateAccount.useMutation({
    onSuccess: () => {
      toast.success("账号信息已更新");
      utils.user.me.invalidate();
    },
    onError: (error) => {
      toast.error("更新失败", { description: error.message });
    },
  });

  const changePasswordMutation = trpc.user.changePassword.useMutation({
    onSuccess: () => {
      toast.success("密码修改成功");
      passwordForm.reset();
    },
    onError: (error) => {
      toast.error("修改失败", { description: error.message });
    },
  });

  const deleteAccountMutation = trpc.user.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("账号已注销");
      signOut({ callbackUrl: "/" });
    },
    onError: (error) => {
      toast.error("注销失败", { description: error.message });
      setIsDeleting(false);
    },
  });

  const [customPronouns, setCustomPronouns] = useState(false);

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nickname: "",
      bio: "",
      pronouns: "",
      website: "",
      location: "",
      socialLinks: {
        twitter: "",
        github: "",
        discord: "",
        bilibili: "",
        youtube: "",
        pixiv: "",
      },
    },
  });

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      username: "",
      email: "",
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    if (user) {
      const socialLinks = (user.socialLinks as Record<string, string>) || {};
      const pronounsValue = user.pronouns || "";
      const isCustomPronouns = Boolean(pronounsValue && !PRONOUNS_OPTIONS.find(p => p.value === pronounsValue));
      setCustomPronouns(isCustomPronouns);
      
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

      accountForm.reset({
        username: user.username,
        email: user.email,
      });
    }
  }, [user, form, accountForm]);

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

  async function onAccountSubmit(data: AccountForm) {
    setIsAccountLoading(true);
    try {
      await updateAccountMutation.mutateAsync({
        username: data.username,
        email: data.email,
      });
    } finally {
      setIsAccountLoading(false);
    }
  }

  async function onPasswordSubmit(data: PasswordForm) {
    setIsPasswordLoading(true);
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
    } finally {
      setIsPasswordLoading(false);
    }
  }

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== "DELETE") {
      toast.error("请输入 DELETE 确认");
      return;
    }
    if (!deletePassword) {
      toast.error("请输入密码");
      return;
    }
    setIsDeleting(true);
    await deleteAccountMutation.mutateAsync({
      password: deletePassword,
      confirmText: "DELETE",
    });
  }, [deleteConfirmText, deletePassword, deleteAccountMutation]);

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

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

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
        <Skeleton className="h-10 w-32 mb-6" />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!session || !user) {
    return null;
  }

  return (
    <PageWrapper>
      <div className="container py-6 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-6"
        >
          <User className="h-8 w-8" />
          <h1 className="text-2xl font-bold">个人中心</h1>
        </motion.div>

        <div className="space-y-6">
          {/* 个人资料 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
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

                    <Separator className="my-6" />

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">个人信息</h3>

                      <FormField
                        control={form.control}
                        name="pronouns"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <AtSign className="h-4 w-4" />
                              代词 (Pronouns)
                            </FormLabel>
                            {customPronouns ? (
                              <div className="flex gap-2">
                                <FormControl>
                                  <Input
                                    placeholder="自定义代词"
                                    {...field}
                                  />
                                </FormControl>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCustomPronouns(false);
                                    field.onChange("");
                                  }}
                                >
                                  选择
                                </Button>
                              </div>
                            ) : (
                              <Select
                                value={field.value || ""}
                                onValueChange={(value) => {
                                  if (value === "custom") {
                                    setCustomPronouns(true);
                                    field.onChange("");
                                  } else {
                                    field.onChange(value);
                                  }
                                }}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="选择代词" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {PRONOUNS_OPTIONS.map((option) => (
                                    <SelectItem key={option.value || "none"} value={option.value || "none"}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <Globe className="h-4 w-4" />
                              个人网站
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="https://example.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="location"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              所在地
                            </FormLabel>
                            <FormControl>
                              <Input placeholder="城市、国家" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Separator className="my-6" />

                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">社交账号</h3>
                      <p className="text-sm text-muted-foreground">填写您的社交账号用户名或链接</p>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                          control={form.control}
                          name="socialLinks.twitter"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Twitter / X</FormLabel>
                              <FormControl>
                                <Input placeholder="@username 或链接" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="socialLinks.github"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>GitHub</FormLabel>
                              <FormControl>
                                <Input placeholder="用户名或链接" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="socialLinks.discord"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Discord</FormLabel>
                              <FormControl>
                                <Input placeholder="用户名#1234" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="socialLinks.bilibili"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>哔哩哔哩</FormLabel>
                              <FormControl>
                                <Input placeholder="UID 或主页链接" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="socialLinks.youtube"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>YouTube</FormLabel>
                              <FormControl>
                                <Input placeholder="频道链接" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="socialLinks.pixiv"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Pixiv</FormLabel>
                              <FormControl>
                                <Input placeholder="用户 ID 或链接" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
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
              </CardContent>
            </Card>
          </motion.div>

          {/* 账号信息 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  账号信息
                </CardTitle>
                <CardDescription>修改您的用户名和邮箱</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...accountForm}>
                  <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
                    <FormField
                      control={accountForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>用户名</FormLabel>
                          <FormControl>
                            <Input placeholder="用户名" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={accountForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>邮箱</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="your@email.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-sm text-muted-foreground">
                        <span className="mr-4">角色: {user.role === "OWNER" ? "站长" : user.role === "ADMIN" ? "管理员" : "普通用户"}</span>
                        <span>注册于: {new Date(user.createdAt).toLocaleDateString("zh-CN")}</span>
                      </div>
                      <Button type="submit" disabled={isAccountLoading}>
                        {isAccountLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        保存
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>

          {/* 修改密码 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  修改密码
                </CardTitle>
                <CardDescription>定期更换密码可以提高账号安全性</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>当前密码</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="请输入当前密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>新密码</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="请输入新密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>确认新密码</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="请再次输入新密码" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={isPasswordLoading}>
                      {isPasswordLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      修改密码
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </motion.div>

          <Separator />

          {/* 危险操作 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  危险操作
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">退出登录</p>
                    <p className="text-sm text-muted-foreground">
                      退出当前账号
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline">
                        <LogOut className="h-4 w-4 mr-2" />
                        退出登录
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确定要退出登录吗？</AlertDialogTitle>
                        <AlertDialogDescription>
                          退出后需要重新登录才能访问个人功能。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction onClick={handleLogout}>
                          确定退出
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-destructive">注销账号</p>
                    <p className="text-sm text-muted-foreground">
                      永久删除您的账号，视频将转移给站长
                    </p>
                  </div>
                  <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
                    setDeleteDialogOpen(open);
                    if (!open) {
                      setDeletePassword("");
                      setDeleteConfirmText("");
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" disabled={user?.role === "OWNER"}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        注销账号
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-destructive">注销账号</DialogTitle>
                        <DialogDescription>
                          此操作不可撤销。您的账号将被永久删除，您上传的视频和播放列表将转移给站长。
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">请输入密码确认身份</label>
                          <Input
                            type="password"
                            placeholder="输入密码"
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">
                            请输入 <span className="font-mono text-destructive">DELETE</span> 确认注销
                          </label>
                          <Input
                            type="text"
                            placeholder="DELETE"
                            value={deleteConfirmText}
                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                          取消
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteAccount}
                          disabled={isDeleting || deleteConfirmText !== "DELETE" || !deletePassword}
                        >
                          {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          确认注销
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                {user?.role === "OWNER" && (
                  <p className="text-xs text-muted-foreground">
                    站长账号不能注销，请先在用户管理中转让站长权限。
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageWrapper>
  );
}
