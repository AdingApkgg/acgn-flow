"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { create } from "zustand";
import { persist } from "zustand/middleware";

// 动态导入 Three.js 组件以避免 SSR 问题
const ParticleBackground = dynamic(
  () => import("./particle-background").then((mod) => mod.ParticleBackground),
  { ssr: false }
);

const FloatingShapes = dynamic(
  () => import("./floating-shapes").then((mod) => mod.FloatingShapes),
  { ssr: false }
);

const WaveBackground = dynamic(
  () => import("./wave-background").then((mod) => mod.WaveBackground),
  { ssr: false }
);

export type BackgroundType = "particles" | "shapes" | "wave" | "none";

interface BackgroundStore {
  backgroundType: BackgroundType;
  setBackgroundType: (type: BackgroundType) => void;
}

export const useBackgroundStore = create<BackgroundStore>()(
  persist(
    (set) => ({
      backgroundType: "particles",
      setBackgroundType: (type) => set({ backgroundType: type }),
    }),
    {
      name: "background-preference",
    }
  )
);

export function SceneBackground() {
  const { backgroundType } = useBackgroundStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 避免 SSR 水合问题
  if (!mounted) return null;

  switch (backgroundType) {
    case "particles":
      return <ParticleBackground />;
    case "shapes":
      return <FloatingShapes />;
    case "wave":
      return <WaveBackground />;
    case "none":
    default:
      return null;
  }
}
