import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "上传视频",
  description: "上传并分享您的 ACGN 相关视频内容",
  robots: {
    index: false, // 功能页面不索引
    follow: false,
  },
};

export default function UploadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
