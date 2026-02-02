import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的视频",
  description: "管理您上传的所有视频",
  robots: {
    index: false, // 私人页面不索引
    follow: false,
  },
};

export default function MyVideosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
