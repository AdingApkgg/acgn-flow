import type { Metadata } from "next";

const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

export const metadata: Metadata = {
  title: "标签",
  description: `浏览 ${siteName} 的所有视频标签，按分类查找 ACGN 相关视频内容`,
  keywords: ["标签", "分类", "ACGN", "动漫", "视频"],
};

export default function TagsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
