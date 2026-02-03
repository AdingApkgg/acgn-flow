import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ==================== 搜索历史 Store ====================

interface SearchHistoryState {
  history: string[];
  maxItems: number;
  addSearch: (query: string) => void;
  removeSearch: (query: string) => void;
  clearHistory: () => void;
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      history: [],
      maxItems: 10,
      addSearch: (query) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        set((state) => {
          const filtered = state.history.filter((h) => h !== trimmed);
          return {
            history: [trimmed, ...filtered].slice(0, state.maxItems),
          };
        });
      },
      removeSearch: (query) => {
        set((state) => ({
          history: state.history.filter((h) => h !== query),
        }));
      },
      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "search-history",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ==================== UI Store ====================

interface UIState {
  // 侧边栏状态
  sidebarCollapsed: boolean;
  sidebarOpen: boolean;
  // 播放器状态
  playerFullscreen: boolean;
  playerPiP: boolean;
  // 主题偏好
  reducedMotion: boolean;
  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setPlayerFullscreen: (fullscreen: boolean) => void;
  setPlayerPiP: (pip: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarOpen: false,
      playerFullscreen: false,
      playerPiP: false,
      reducedMotion: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setPlayerFullscreen: (fullscreen) => set({ playerFullscreen: fullscreen }),
      setPlayerPiP: (pip) => set({ playerPiP: pip }),
      setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
    }),
    {
      name: "ui-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        reducedMotion: state.reducedMotion,
      }),
    }
  )
);

// ==================== 观看历史 Store ====================

interface WatchHistoryItem {
  videoId: string;
  title: string;
  coverUrl?: string;
  progress: number; // 0-1
  duration: number; // 秒
  watchedAt: number; // timestamp
}

interface WatchHistoryState {
  history: WatchHistoryItem[];
  maxItems: number;
  addOrUpdate: (item: Omit<WatchHistoryItem, "watchedAt">) => void;
  remove: (videoId: string) => void;
  clear: () => void;
  getProgress: (videoId: string) => number | null;
}

export const useWatchHistoryStore = create<WatchHistoryState>()(
  persist(
    (set, get) => ({
      history: [],
      maxItems: 100,
      addOrUpdate: (item) => {
        set((state) => {
          const filtered = state.history.filter((h) => h.videoId !== item.videoId);
          const newItem: WatchHistoryItem = {
            ...item,
            watchedAt: Date.now(),
          };
          return {
            history: [newItem, ...filtered].slice(0, state.maxItems),
          };
        });
      },
      remove: (videoId) => {
        set((state) => ({
          history: state.history.filter((h) => h.videoId !== videoId),
        }));
      },
      clear: () => set({ history: [] }),
      getProgress: (videoId) => {
        const item = get().history.find((h) => h.videoId === videoId);
        return item?.progress ?? null;
      },
    }),
    {
      name: "watch-history-local",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ==================== 快捷键 Store ====================

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  action: string;
  description: string;
}

interface KeyboardState {
  shortcuts: KeyboardShortcut[];
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useKeyboardStore = create<KeyboardState>()((set) => ({
  shortcuts: [
    { key: "k", ctrl: true, action: "search", description: "打开搜索" },
    { key: "k", meta: true, action: "search", description: "打开搜索" },
    { key: "/", action: "search", description: "打开搜索" },
    { key: "Escape", action: "close", description: "关闭弹窗" },
    { key: " ", action: "playPause", description: "播放/暂停" },
    { key: "f", action: "fullscreen", description: "全屏" },
    { key: "m", action: "mute", description: "静音" },
    { key: "ArrowLeft", action: "seekBack", description: "后退 5 秒" },
    { key: "ArrowRight", action: "seekForward", description: "前进 5 秒" },
    { key: "ArrowUp", action: "volumeUp", description: "增加音量" },
    { key: "ArrowDown", action: "volumeDown", description: "减少音量" },
  ],
  enabled: true,
  setEnabled: (enabled) => set({ enabled }),
}));
