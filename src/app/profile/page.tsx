"use client";

import { useSession, signOut, signIn } from "next-auth/react";
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
import { Loader2, Camera, Upload, Link, X, Images, MapPin, Globe, AtSign, User, Key, LogOut, AlertTriangle, Trash2, Link2, Unlink, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// OAuth Provider 配置
const oauthProviders = [
  { id: "github", name: "GitHub", color: "bg-[#24292f] dark:bg-[#f0f0f0]" },
  { id: "google", name: "Google", color: "bg-white border" },
  { id: "discord", name: "Discord", color: "bg-[#5865F2]" },
] as const;

// Provider 图标组件
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
    </svg>
  );
}

const providerIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  github: GitHubIcon,
  google: GoogleIcon,
  discord: DiscordIcon,
};

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
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
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

  // 账号绑定
  const { data: linkedAccounts, isLoading: accountsLoading } = trpc.user.getLinkedAccounts.useQuery(
    undefined,
    { enabled: !!session }
  );

  const unlinkMutation = trpc.user.unlinkAccount.useMutation({
    onSuccess: () => {
      toast.success("账号已解绑");
      utils.user.getLinkedAccounts.invalidate();
      setUnlinkingProvider(null);
    },
    onError: (error) => {
      toast.error("解绑失败", { description: error.message });
      setUnlinkingProvider(null);
    },
  });

  const handleLink = async (providerId: string) => {
    setLinkingProvider(providerId);
    try {
      await signIn(providerId, { callbackUrl: "/profile?linked=1" });
    } catch {
      toast.error("绑定失败");
      setLinkingProvider(null);
    }
  };

  const handleUnlink = (providerId: string) => {
    setUnlinkingProvider(providerId);
  };

  const confirmUnlink = () => {
    if (unlinkingProvider) {
      unlinkMutation.mutate({ provider: unlinkingProvider });
    }
  };

  const isLinked = (providerId: string) => {
    return linkedAccounts?.some((account) => account.provider === providerId);
  };

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
    <div className="container py-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <User className="h-8 w-8" />
        <h1 className="text-2xl font-bold">个人信息</h1>
      </div>

        <div className="space-y-6">
          {/* 个人资料 */}
          <div>
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
          </div>

          {/* 账号信息 */}
          <div>
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
          </div>

          {/* 账号绑定 */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link2 className="h-5 w-5" />
                  账号绑定
                </CardTitle>
                <CardDescription>
                  绑定第三方账号后，可使用一键登录
                </CardDescription>
              </CardHeader>
              <CardContent>
                {accountsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {oauthProviders.map((provider) => {
                      const Icon = providerIcons[provider.id];
                      const linked = isLinked(provider.id);

                      return (
                        <div
                          key={provider.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${provider.color}`}>
                              <Icon className={`h-5 w-5 ${provider.id === "google" ? "" : "text-white"} ${provider.id === "github" ? "dark:text-[#24292f]" : ""}`} />
                            </div>
                            <div>
                              <p className="font-medium">{provider.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {linked ? "已绑定" : "未绑定"}
                              </p>
                            </div>
                          </div>
                          {linked ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnlink(provider.id)}
                              disabled={unlinkMutation.isPending}
                              className="text-destructive hover:text-destructive"
                            >
                              <Unlink className="h-4 w-4 mr-1" />
                              解绑
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleLink(provider.id)}
                              disabled={linkingProvider !== null}
                            >
                              {linkingProvider === provider.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4 mr-1" />
                              )}
                              绑定
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  绑定后可使用第三方账号快速登录。请确保第三方账号的邮箱与当前账号邮箱一致。
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 修改密码 */}
          <div>
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
          </div>

          <Separator />

          {/* 危险操作 */}
          <div>
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
          </div>
        </div>
      
      {/* 解绑确认对话框 */}
      <AlertDialog open={!!unlinkingProvider} onOpenChange={() => setUnlinkingProvider(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要解绑此账号吗？</AlertDialogTitle>
            <AlertDialogDescription>
              解绑后将无法使用该第三方账号登录。如果您没有设置密码且这是唯一的登录方式，解绑将会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnlink}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinkMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认解绑
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
