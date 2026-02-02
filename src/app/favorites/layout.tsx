import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的收藏",
  description: "查看您收藏的所有视频",
  robots: {
    index: false, // 私人页面不索引
    follow: false,
  },
};

export default function FavoritesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
