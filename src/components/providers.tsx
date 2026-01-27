"use client";

import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import superjson from "superjson";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import dynamic from "next/dynamic";
import { useVisualSettings } from "@/components/three/scene-background";

// 动态导入 Three.js 背景以避免 SSR 问题
const SceneBackground = dynamic(
  () => import("@/components/three/scene-background").then((mod) => mod.SceneBackground),
  { ssr: false }
);

// 应用视觉设置 CSS 变量
function VisualSettingsApplier({ children }: { children: React.ReactNode }) {
  const { opacity, blur, borderRadius } = useVisualSettings();

  useEffect(() => {
    // 直接应用 CSS 变量，无需检查 mounted 状态
    document.documentElement.style.setProperty("--visual-opacity", String(opacity / 100));
    document.documentElement.style.setProperty("--visual-blur", `${blur}px`);
    document.documentElement.style.setProperty("--visual-radius", `${borderRadius}px`);
  }, [opacity, blur, borderRadius]);

  return <>{children}</>;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return "";
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <VisualSettingsApplier>
              <SceneBackground />
              {children}
              <Toaster richColors position="top-center" />
            </VisualSettingsApplier>
          </ThemeProvider>
        </SessionProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
