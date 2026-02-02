import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "设置",
  description: "管理您的账户设置",
  robots: {
    index: false, // 私人页面不索引
    follow: false,
  },
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
