import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "编辑视频",
  description: "编辑视频信息",
  robots: {
    index: false,
    follow: false,
  },
};

export default function EditVideoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
