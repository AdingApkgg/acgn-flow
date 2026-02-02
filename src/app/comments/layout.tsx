import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的评论",
  description: "查看您发表的所有评论",
  robots: {
    index: false, // 私人页面不索引
    follow: false,
  },
};

export default function CommentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
