import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "个人资料",
  description: "管理您的个人资料信息",
  robots: {
    index: false, // 私人页面不索引
    follow: false,
  },
};

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
