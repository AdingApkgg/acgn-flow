import type { Metadata } from "next";

const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

export const metadata: Metadata = {
  title: "注册",
  description: `注册 ${siteName} 账户，开始分享和发现 ACGN 内容`,
  robots: {
    index: false,
    follow: true,
  },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
