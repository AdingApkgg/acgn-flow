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
import { Form, FormLabel } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, Upload, Import, Layers, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { VideoFormFields } from "@/components/video/video-form-fields";
import { TagSelector } from "@/components/video/tag-selector";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const uploadSchema = z.object({
  title: z.string().min(1, "请输入标题").max(100, "标题最多100个字符"),
  description: z.string().max(5000, "简介最多5000个字符").optional().or(z.literal("")),
  coverUrl: z.string().url("请输入有效的封面URL").optional().or(z.literal("")),
  videoUrl: z.string().url("请输入有效的视频URL"),
  subtitleUrl: z.string().url("请输入有效的字幕URL").optional().or(z.literal("")),
  danmakuUrl: z.string().url("请输入有效的弹幕URL").optional().or(z.literal("")),
});

type UploadForm = z.infer<typeof uploadSchema>;

// B站视频信息接口
interface BilibiliVideoInfo {
  title: string;
  description: string;
  coverUrl: string;
  duration: number;
  tags: string[];
  uploader: string;
  bvid: string;
  aid: number;
  videoUrl: string;
  page?: number; // 分P页码
  cid?: number; // 分P的cid
  customId?: string; // 自定义ID（用于分P等情况）
  pages?: { page: number; title: string; cid?: number }[]; // 所有分P信息
}

// 导入模式
type ImportMode = "single" | "batch" | "user" | "favorite" | "season" | "series" | "pages";

// B站导入对话框组件
function BilibiliImportDialog({
  onImport,
  onBatchImport,
  allTags,
  setSelectedTags,
  setNewTags,
}: {
  onImport: (data: BilibiliVideoInfo) => void;
  onBatchImport: (videos: BilibiliVideoInfo[]) => void;
  allTags: { id: string; name: string; slug: string }[] | undefined;
  setSelectedTags: (tags: string[]) => void;
  setNewTags: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ImportMode>("single");
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<BilibiliVideoInfo | null>(null);
  const [batchData, setBatchData] = useState<BilibiliVideoInfo[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<Set<number>>(new Set());
  const [pagesVideoInfo, setPagesVideoInfo] = useState<BilibiliVideoInfo | null>(null); // 分P模式的视频基本信息
  const [selectedPage, setSelectedPage] = useState<number>(1); // 选中的分P

  const modeLabels: Record<ImportMode, { label: string; placeholder: string; description: string }> = {
    single: {
      label: "单个视频",
      placeholder: "输入B站视频链接，如 BV1xx411c7mD",
      description: "导入单个视频",
    },
    batch: {
      label: "批量链接",
      placeholder: "每行一个视频链接或BV号",
      description: "一次导入多个视频链接",
    },
    user: {
      label: "用户投稿",
      placeholder: "输入用户UID，如 123456",
      description: "导入用户的所有投稿视频",
    },
    favorite: {
      label: "收藏夹",
      placeholder: "输入收藏夹ID，如 123456",
      description: "导入公开收藏夹的视频",
    },
    season: {
      label: "视频合集",
      placeholder: "输入 UID,合集ID 或粘贴合集页面URL",
      description: "导入视频合集中的所有视频",
    },
    series: {
      label: "视频系列",
      placeholder: "输入 UID,系列ID 或粘贴系列页面URL",
      description: "导入视频系列中的所有视频",
    },
    pages: {
      label: "视频分P",
      placeholder: "输入多P视频链接，如 BV1xx411c7mD",
      description: "选择一个分P作为视频起始播放位置",
    },
  };

  const resetState = () => {
    setInputValue("");
    setPreviewData(null);
    setBatchData([]);
    setSelectedVideos(new Set());
    setPagesVideoInfo(null);
    setSelectedPage(1);
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const postBilibiliApi = async <T extends Record<string, unknown>>(
    url: string,
    payload: Record<string, unknown>,
    fallbackError: string
  ): Promise<T> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    let result: T | null = null;

    if (contentType.includes("application/json")) {
      try {
        const parsed: unknown = await response.json();
        result = isRecord(parsed) ? (parsed as T) : null;
      } catch {
        result = null;
      }
    } else {
      // 消耗响应体，避免未读取的 body 引发调试干扰
      await response.text().catch(() => "");
    }

    if (!response.ok) {
      const apiError = typeof result?.error === "string"
        ? result.error
        : typeof result?.message === "string"
          ? result.message
          : `${fallbackError}（HTTP ${response.status}）`;
      throw new Error(apiError);
    }

    if (!result) {
      throw new Error(`${fallbackError}（服务器返回了非 JSON 响应）`);
    }

    return result;
  };

  const handleParse = async () => {
    if (!inputValue.trim()) {
      toast.error("请输入内容");
      return;
    }

    setIsLoading(true);
    try {
      if (mode === "single") {
        const result = await postBilibiliApi<{ data: BilibiliVideoInfo }>(
          "/api/bilibili/parse",
          { url: inputValue },
          "解析失败"
        );

        setPreviewData(result.data);
        toast.success("解析成功");
      } else if (mode === "pages") {
        // 分P模式 - 获取分P列表供选择
        const result = await postBilibiliApi<{ data: BilibiliVideoInfo[]; videoInfo?: BilibiliVideoInfo }>(
          "/api/bilibili/batch",
          { type: "pages", value: inputValue },
          "获取失败"
        );

        setBatchData(result.data);
        setSelectedPage(1);
        // 保存视频基本信息
        if (result.videoInfo) {
          setPagesVideoInfo({
            ...result.videoInfo,
            videoUrl: `https://parse.saop.cc/api/bili/${result.videoInfo.bvid}?p=1`,
          });
        }
        toast.success(`找到 ${result.data.length} 个分P`);
      } else {
        // 批量模式
        const result = await postBilibiliApi<{ data: BilibiliVideoInfo[] }>(
          "/api/bilibili/batch",
          { type: mode === "batch" ? "videos" : mode, value: inputValue },
          "获取失败"
        );

        setBatchData(result.data);
        setSelectedVideos(new Set(result.data.map((_: BilibiliVideoInfo, i: number) => i)));
        toast.success(`找到 ${result.data.length} 个视频`);
      }
    } catch (error) {
      console.error("解析失败:", error);
      toast.error(error instanceof Error ? error.message : "解析失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmImport = () => {
    if (mode === "single" && previewData) {
      onImport(previewData);

      if (previewData.tags && previewData.tags.length > 0) {
        const matchedTagIds: string[] = [];
        const newTagNames: string[] = [];

        previewData.tags.forEach((tagName) => {
          const existingTag = allTags?.find(
            (t) => t.name.toLowerCase() === tagName.toLowerCase()
          );
          if (existingTag) {
            matchedTagIds.push(existingTag.id);
          } else {
            newTagNames.push(tagName);
          }
        });

        setSelectedTags(matchedTagIds);
        setNewTags(newTagNames);
      }

      toast.success("已导入B站视频信息");
    } else if (mode === "pages" && pagesVideoInfo) {
      // 分P模式 - 只导入一个视频，使用选中的分P，并保存所有分P信息
      const pagesData = batchData.map((p, index) => ({
        page: index + 1,
        title: p.title,
        cid: p.cid,
      }));
      const videoWithPage: BilibiliVideoInfo = {
        ...pagesVideoInfo,
        videoUrl: `https://parse.saop.cc/api/bili/${pagesVideoInfo.bvid}?p=${selectedPage}`,
        pages: pagesData, // 保存所有分P信息
      };
      onImport(videoWithPage);

      if (pagesVideoInfo.tags && pagesVideoInfo.tags.length > 0) {
        const matchedTagIds: string[] = [];
        const newTagNames: string[] = [];

        pagesVideoInfo.tags.forEach((tagName) => {
          const existingTag = allTags?.find(
            (t) => t.name.toLowerCase() === tagName.toLowerCase()
          );
          if (existingTag) {
            matchedTagIds.push(existingTag.id);
          } else {
            newTagNames.push(tagName);
          }
        });

        setSelectedTags(matchedTagIds);
        setNewTags(newTagNames);
      }

      toast.success(`已导入视频，默认播放 P${selectedPage}`);
    } else if (batchData.length > 0) {
      const selected = batchData.filter((_, i) => selectedVideos.has(i));
      if (selected.length === 0) {
        toast.error("请选择要导入的视频");
        return;
      }
      onBatchImport(selected);
      toast.success(`已选择 ${selected.length} 个视频准备导入`);
    }

    setOpen(false);
    resetState();
  };

  const toggleVideoSelection = (index: number) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedVideos(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedVideos.size === batchData.length) {
      setSelectedVideos(new Set());
    } else {
      setSelectedVideos(new Set(batchData.map((_, i) => i)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="gap-2">
          <Import className="h-4 w-4" />
          从B站导入
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BilibiliIcon className="h-5 w-5 text-[#00A1D6]" />
            从B站导入视频
          </DialogTitle>
          <DialogDescription>
            支持多种导入方式，批量获取视频信息
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 模式选择 */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(modeLabels) as ImportMode[]).map((m) => (
              <Button
                key={m}
                type="button"
                variant={mode === m ? "default" : "outline"}
                size="sm"
                onClick={() => { setMode(m); resetState(); }}
              >
                {modeLabels[m].label}
              </Button>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">
            {modeLabels[mode].description}
          </p>

          {/* 输入区域 */}
          <div className="flex gap-2">
            {mode === "batch" ? (
              <Textarea
                placeholder={modeLabels[mode].placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="min-h-[100px]"
              />
            ) : (
              <Input
                placeholder={modeLabels[mode].placeholder}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleParse();
                  }
                }}
              />
            )}
            <Button onClick={handleParse} disabled={isLoading} className="shrink-0">
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "获取"
              )}
            </Button>
          </div>

          {/* 单个视频预览 */}
          {mode === "single" && previewData && (
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex gap-4">
                {previewData.coverUrl && (
                  <div className="w-40 h-24 rounded-lg overflow-hidden bg-muted shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewData.coverUrl}
                      alt={previewData.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium line-clamp-2">{previewData.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    UP主: {previewData.uploader}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    时长: {Math.floor(previewData.duration / 60)}:{String(previewData.duration % 60).padStart(2, "0")}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{previewData.bvid}</span>
                    <span>•</span>
                    <span className="text-primary font-medium">av{previewData.aid}</span>
                  </div>
                </div>
              </div>

              {previewData.tags && previewData.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {previewData.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 分P视频列表 - 单选模式 */}
          {mode === "pages" && batchData.length > 0 && pagesVideoInfo && (
            <div className="space-y-3">
              {/* 视频信息预览 */}
              <div className="border rounded-lg p-3 bg-muted/30">
                <div className="flex gap-3">
                  {pagesVideoInfo.coverUrl && (
                    <div className="w-24 h-16 rounded overflow-hidden bg-muted shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={pagesVideoInfo.coverUrl}
                        alt={pagesVideoInfo.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium line-clamp-1">{pagesVideoInfo.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {pagesVideoInfo.uploader} • av{pagesVideoInfo.aid} • 共{batchData.length}P
                    </p>
                  </div>
                </div>
              </div>

              {/* 分P选择列表 */}
              <div>
                <p className="text-sm font-medium mb-2">选择起始分P（当前: P{selectedPage}）</p>
                <div className="max-h-[200px] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {batchData.map((page, index) => (
                    <div
                      key={`page-${index}`}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                        selectedPage === index + 1 ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedPage(index + 1)}
                    >
                      <input
                        type="radio"
                        name="page-select"
                        checked={selectedPage === index + 1}
                        onChange={() => setSelectedPage(index + 1)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{page.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 批量视频列表 - 多选模式 */}
          {mode !== "single" && mode !== "pages" && batchData.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  找到 {batchData.length} 个视频，已选择 {selectedVideos.size} 个
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={toggleSelectAll}>
                  {selectedVideos.size === batchData.length ? "取消全选" : "全选"}
                </Button>
              </div>
              <div className="max-h-[300px] overflow-y-auto space-y-2 border rounded-lg p-2">
                {batchData.map((video, index) => (
                  <div
                    key={`${video.bvid}-${video.aid}-${index}`}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                      selectedVideos.has(index) ? "bg-primary/10" : "hover:bg-muted"
                    }`}
                    onClick={() => toggleVideoSelection(index)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedVideos.has(index)}
                      onChange={() => {}}
                      className="h-4 w-4"
                    />
                    {video.coverUrl && (
                      <div className="w-20 h-12 rounded overflow-hidden bg-muted shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={video.coverUrl}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium line-clamp-1">{video.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {video.uploader} • {video.customId || `av${video.aid}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleConfirmImport}
            disabled={
              mode === "single" ? !previewData :
              mode === "pages" ? !pagesVideoInfo :
              selectedVideos.size === 0
            }
          >
            {mode === "single" ? "确认导入" :
             mode === "pages" ? `导入视频 (P${selectedPage})` :
             `导入 ${selectedVideos.size} 个视频`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// B站图标组件
function BilibiliIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373Z" />
    </svg>
  );
}

export default function UploadPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [biliAid, setBiliAid] = useState<number | null>(null); // B站AV号，用于自定义视频ID
  const [biliBvid, setBiliBvid] = useState<string | null>(null); // B站BV号，用于获取弹幕
  const [biliCid, setBiliCid] = useState<number | null>(null); // B站CID，用于获取弹幕
  const [biliDuration, setBiliDuration] = useState<number | null>(null); // B站视频时长
  const [biliPages, setBiliPages] = useState<{ page: number; title: string; cid?: number }[] | null>(null); // B站分P信息
  const [batchQueue, setBatchQueue] = useState<BilibiliVideoInfo[]>([]); // 批量导入队列
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  
  // 合集相关状态
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [episodeNum, setEpisodeNum] = useState<number>(1);
  const [showCreateSeries, setShowCreateSeries] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");

  const { data: allTags } = trpc.tag.list.useQuery({ limit: 100 });
  
  // 获取用户的合集列表
  const { data: userSeries, refetch: refetchSeries } = trpc.series.listByUser.useQuery(
    { limit: 50 },
    { enabled: !!session }
  );
  
  // 创建合集
  const createSeriesMutation = trpc.series.create.useMutation({
    onSuccess: (newSeries) => {
      setSelectedSeriesId(newSeries.id);
      setShowCreateSeries(false);
      setNewSeriesTitle("");
      refetchSeries();
      toast.success("合集创建成功");
    },
    onError: (error) => {
      toast.error("创建合集失败", { description: error.message });
    },
  });
  
  // 添加视频到合集
  const addToSeriesMutation = trpc.series.addVideo.useMutation();
  
  const createMutation = trpc.video.create.useMutation({
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
      subtitleUrl: "",
      danmakuUrl: "",
    },
  });

  const handleBilibiliImport = (data: BilibiliVideoInfo) => {
    form.setValue("title", data.title);
    form.setValue("description", data.description || "");
    form.setValue("coverUrl", data.coverUrl || "");
    form.setValue("videoUrl", data.videoUrl);
    // 保存AV号、BV号、CID、时长和分P信息
    setBiliAid(data.aid);
    setBiliBvid(data.bvid);
    setBiliCid(data.cid || null);
    setBiliDuration(data.duration);
    setBiliPages(data.pages || null);
  };

  // 批量提交 IndexNow
  const submitIndexNowMutation = trpc.video.submitBatchToIndexNow.useMutation();

  // 批量导入处理（并发优化）
  const handleBatchImport = async (videos: BilibiliVideoInfo[]) => {
    setBatchQueue(videos);
    setBatchProgress({ current: 0, total: videos.length });

    // 保存成功导入的视频信息（包含弹幕需要的 cid/bvid）
    const successVideos: Array<{ videoId: string; cid?: number; bvid: string }> = [];
    let completed = 0;
    const CONCURRENCY = 5; // 并发数限制

    // 创建单个视频的导入任务
    const importVideo = async (video: BilibiliVideoInfo): Promise<{ success: boolean; id?: string; video: BilibiliVideoInfo }> => {
      try {
        // 匹配标签
        const matchedTagIds: string[] = [];
        const newTagNames: string[] = [];

        video.tags?.forEach((tagName) => {
          const existingTag = allTags?.find(
            (t) => t.name.toLowerCase() === tagName.toLowerCase()
          );
          if (existingTag) {
            matchedTagIds.push(existingTag.id);
          } else {
            newTagNames.push(tagName);
          }
        });

        const result = await createMutation.mutateAsync({
          customId: video.customId || `av${video.aid}`,
          duration: video.duration,
          title: video.title,
          description: video.description || "",
          coverUrl: video.coverUrl || "",
          videoUrl: video.videoUrl,
          subtitleUrl: "",
          danmakuUrl: "",
          tagIds: matchedTagIds,
          tagNames: newTagNames.slice(0, 5),
          skipIndexNow: true,
        });
        return { success: true, id: result.id, video };
      } catch (error) {
        console.error(`导入视频 ${video.title} 失败:`, error);
        return { success: false, video };
      } finally {
        completed++;
        setBatchProgress({ current: completed, total: videos.length });
      }
    };

    // 并发控制执行
    const chunks: BilibiliVideoInfo[][] = [];
    for (let i = 0; i < videos.length; i += CONCURRENCY) {
      chunks.push(videos.slice(i, i + CONCURRENCY));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(chunk.map(importVideo));
      results.forEach((r) => {
        if (r.success && r.id) {
          successVideos.push({
            videoId: r.id,
            cid: r.video.cid,
            bvid: r.video.bvid,
          });
        }
      });
    }

    const successCount = successVideos.length;
    const failCount = videos.length - successCount;
    const successVideoIds = successVideos.map((v) => v.videoId);

    // 批量完成后一次性提交 IndexNow
    if (successVideoIds.length > 0) {
      submitIndexNowMutation.mutate({ videoIds: successVideoIds });
    }

    // 异步获取弹幕（使用 keepalive 确保页面跳转后请求不会被取消）
    // 即使部分视频导入失败，也尝试为所有有 cid/bvid 的视频获取弹幕
    const allVideosForDanmaku = videos
      .filter((v) => v.cid || v.bvid)
      .map((v) => ({
        // 优先使用成功导入的 videoId，否则使用 customId 或 av 号
        videoId: successVideos.find((s) => s.bvid === v.bvid)?.videoId 
          || v.customId 
          || `av${v.aid}`,
        cid: v.cid,
        bvid: v.bvid,
        duration: v.duration, // 传递时长以获取完整弹幕
      }));

    if (allVideosForDanmaku.length > 0) {
      console.log("[弹幕导入] 开始获取弹幕:", allVideosForDanmaku);
      fetch("/api/bilibili/danmaku", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videos: allVideosForDanmaku }),
        keepalive: true, // 确保页面跳转后请求继续执行
      }).then((res) => res.json())
        .then((data) => console.log("[弹幕导入] 完成:", data))
        .catch((err) => console.error("[弹幕导入] 失败:", err));
    }

    setBatchProgress(null);
    setBatchQueue([]);

    if (successCount > 0) {
      toast.success(`成功导入 ${successCount} 个视频${failCount > 0 ? `，${failCount} 个失败` : ""}`);
      router.push("/my-videos");
    } else {
      toast.error("所有视频导入失败");
    }
  };

  async function onSubmit(data: UploadForm) {
    setIsLoading(true);
    try {
      const result = await createMutation.mutateAsync({
        // 如果是从B站导入的，使用AV号作为视频ID
        ...(biliAid ? { customId: `av${biliAid}` } : {}),
        ...(biliDuration ? { duration: biliDuration } : {}),
        ...(biliPages && biliPages.length > 1 ? { pages: biliPages } : {}), // 分P信息
        title: data.title,
        description: data.description,
        coverUrl: data.coverUrl || "",
        videoUrl: data.videoUrl,
        subtitleUrl: data.subtitleUrl || "",
        danmakuUrl: data.danmakuUrl || "",
        tagIds: selectedTags,
        tagNames: newTags,
      });
      
      // 如果是从B站导入的，异步获取弹幕
      if (biliBvid || biliCid) {
        console.log("[弹幕导入] 单个视频，开始获取弹幕:", { videoId: result.id, bvid: biliBvid, cid: biliCid, duration: biliDuration });
        fetch("/api/bilibili/danmaku", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videos: [{ videoId: result.id, bvid: biliBvid, cid: biliCid, duration: biliDuration }],
          }),
          keepalive: true,
        }).then((res) => res.json())
          .then((d) => console.log("[弹幕导入] 完成:", d))
          .catch((err) => console.error("[弹幕导入] 失败:", err));
      }
      
      // 如果选择了合集，添加视频到合集
      if (selectedSeriesId) {
        try {
          await addToSeriesMutation.mutateAsync({
            seriesId: selectedSeriesId,
            videoId: result.id,
            episodeNum,
          });
        } catch (error) {
          console.error("添加到合集失败:", error);
          // 不阻塞发布流程
        }
      }
      
      toast.success("发布成功");
      router.push(`/video/${result.id}`);
    } catch {
      // onError 回调已处理错误提示
    } finally {
      setIsLoading(false);
      setBiliAid(null); // 重置
      setBiliBvid(null);
      setBiliCid(null);
      setBiliDuration(null);
      setBiliPages(null);
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

  // 批量导入进度显示
  if (batchProgress) {
    const percentage = Math.round((batchProgress.current / batchProgress.total) * 100);
    const currentVideo = batchQueue[Math.min(batchProgress.current, batchQueue.length - 1)];
    
    return (
      <div className="container py-12 max-w-lg">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 relative">
              <div className="w-20 h-20 rounded-full border-4 border-muted flex items-center justify-center">
                <span className="text-2xl font-bold">{percentage}%</span>
              </div>
              <Loader2 className="absolute -top-1 -right-1 h-6 w-6 animate-spin text-primary" />
            </div>
            <CardTitle>批量导入中</CardTitle>
            <CardDescription>
              正在导入 {batchProgress.current} / {batchProgress.total} 个视频
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={percentage} className="h-2" />
            
            {/* 当前处理的视频 */}
            {currentVideo && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                {currentVideo.coverUrl && (
                  <div className="w-20 h-12 rounded overflow-hidden bg-muted shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentVideo.coverUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">
                    {currentVideo.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {currentVideo.uploader}
                  </p>
                </div>
              </div>
            )}

            {/* 预计时间 */}
            <p className="text-xs text-center text-muted-foreground">
              请勿关闭此页面，导入完成后将自动跳转
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                发布视频
              </CardTitle>
              <CardDescription>
                填写视频信息，提供视频直链即可发布
              </CardDescription>
            </div>
            <BilibiliImportDialog
              onImport={handleBilibiliImport}
              onBatchImport={handleBatchImport}
              allTags={allTags}
              setSelectedTags={setSelectedTags}
              setNewTags={setNewTags}
            />
          </div>
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
                  selectedTags={selectedTags.map((id) => {
                    const tag = allTags?.find((t) => t.id === id);
                    return tag ? { id: tag.id, name: tag.name } : null;
                  }).filter((t): t is { id: string; name: string } => t !== null)}
                  newTags={newTags}
                  onSelectedTagsChange={(tags) => setSelectedTags(tags.map((t) => t.id))}
                  onNewTagsChange={setNewTags}
                />
              </div>

              {/* 合集选择 */}
              <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <FormLabel className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    添加到合集（可选）
                  </FormLabel>
                  {selectedSeriesId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedSeriesId(null);
                        setEpisodeNum(1);
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
                
                {!showCreateSeries ? (
                  <div className="space-y-3">
                    {/* 选择现有合集 */}
                    <Select
                      value={selectedSeriesId || ""}
                      onValueChange={(value) => {
                        setSelectedSeriesId(value || null);
                        // 自动设置集数
                        const series = userSeries?.items.find(s => s.id === value);
                        if (series) {
                          setEpisodeNum(series.episodeCount + 1);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择合集..." />
                      </SelectTrigger>
                      <SelectContent>
                        {userSeries?.items.map((series) => (
                          <SelectItem key={series.id} value={series.id}>
                            <div className="flex items-center gap-2">
                              <span>{series.title}</span>
                              <span className="text-xs text-muted-foreground">
                                ({series.episodeCount}集)
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                        {(!userSeries?.items || userSeries.items.length === 0) && (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            暂无合集
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    
                    {/* 集数设置 */}
                    {selectedSeriesId && (
                      <div className="flex items-center gap-2">
                        <FormLabel className="shrink-0">第</FormLabel>
                        <Input
                          type="number"
                          min={1}
                          value={episodeNum}
                          onChange={(e) => setEpisodeNum(parseInt(e.target.value) || 1)}
                          className="w-20"
                        />
                        <FormLabel className="shrink-0">集</FormLabel>
                      </div>
                    )}
                    
                    {/* 创建新合集按钮 */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateSeries(true)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      创建新合集
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 创建新合集表单 */}
                    <Input
                      placeholder="合集名称"
                      value={newSeriesTitle}
                      onChange={(e) => setNewSeriesTitle(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowCreateSeries(false);
                          setNewSeriesTitle("");
                        }}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!newSeriesTitle.trim() || createSeriesMutation.isPending}
                        onClick={() => {
                          if (newSeriesTitle.trim()) {
                            createSeriesMutation.mutate({ title: newSeriesTitle.trim() });
                          }
                        }}
                      >
                        {createSeriesMutation.isPending && (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        )}
                        创建
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                发布视频
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
