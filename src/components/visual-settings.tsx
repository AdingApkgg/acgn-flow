"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface VisualSettings {
  opacity: number; // 0-100
  blur: number; // 0-20
  borderRadius: number; // 0-24
  setOpacity: (value: number) => void;
  setBlur: (value: number) => void;
  setBorderRadius: (value: number) => void;
}

export const useVisualSettings = create<VisualSettings>()(
  persist(
    (set) => ({
      opacity: 95,
      blur: 10,
      borderRadius: 12,
      setOpacity: (value) => set({ opacity: value }),
      setBlur: (value) => set({ blur: value }),
      setBorderRadius: (value) => set({ borderRadius: value }),
    }),
    {
      name: "visual-settings",
    }
  )
);
