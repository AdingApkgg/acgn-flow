import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "观看历史",
  description: "查看您的视频观看历史记录",
  robots: {
    index: false, // 私人页面不索引
    follow: false,
  },
};

export default function HistoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
