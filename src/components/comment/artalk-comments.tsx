"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";

interface ArtalkCommentsProps {
  pageKey: string;
  pageTitle?: string;
}

declare global {
  interface Window {
    Artalk: {
      init: (config: {
        el: string | HTMLElement;
        pageKey: string;
        pageTitle: string;
        server: string;
        site: string;
        darkMode?: boolean | "auto";
        locale?: string;
      }) => {
        destroy: () => void;
        setDarkMode: (dark: boolean) => void;
      };
    };
  }
}

export function ArtalkComments({ pageKey, pageTitle }: ArtalkCommentsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const artalkRef = useRef<{ destroy: () => void; setDarkMode: (dark: boolean) => void } | null>(null);
  const { data: session } = useSession();
  const { resolvedTheme } = useTheme();

  const server = process.env.NEXT_PUBLIC_ARTALK_SERVER;
  const site = process.env.NEXT_PUBLIC_ARTALK_SITE;

  const isDark = resolvedTheme === "dark";

  // 监听主题变化，更新 Artalk 主题
  useEffect(() => {
    if (artalkRef.current) {
      artalkRef.current.setDarkMode(isDark);
    }
  }, [isDark]);

  useEffect(() => {
    if (!server || !site || !containerRef.current) return;

    // 动态加载 Artalk CSS
    const linkId = "artalk-css";
    if (!document.getElementById(linkId)) {
      const link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = `${server}/dist/Artalk.css`;
      document.head.appendChild(link);
    }

    // 动态加载 Artalk JS
    const scriptId = "artalk-js";
    const existingScript = document.getElementById(scriptId);

    const initArtalk = () => {
      if (window.Artalk && containerRef.current) {
        // 销毁之前的实例
        if (artalkRef.current) {
          artalkRef.current.destroy();
        }

        artalkRef.current = window.Artalk.init({
          el: containerRef.current,
          pageKey: pageKey,
          pageTitle: pageTitle || document.title,
          server: server,
          site: site,
          darkMode: isDark,
          locale: "zh-CN",
        });
      }
    };

    if (existingScript) {
      // 脚本已加载，直接初始化
      if (window.Artalk) {
        initArtalk();
      } else {
        existingScript.addEventListener("load", initArtalk);
      }
    } else {
      // 加载脚本
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `${server}/dist/Artalk.js`;
      script.async = true;
      script.onload = initArtalk;
      document.body.appendChild(script);
    }

    return () => {
      if (artalkRef.current) {
        artalkRef.current.destroy();
        artalkRef.current = null;
      }
    };
  }, [pageKey, pageTitle, server, site, session, isDark]);

  if (!server || !site) {
    return null;
  }

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">评论</h3>
      <div ref={containerRef} className="artalk-container" />
    </div>
  );
}
