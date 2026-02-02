import type { Metadata } from "next";

const siteName = process.env.NEXT_PUBLIC_APP_NAME || "ACGN Flow";

export const metadata: Metadata = {
  title: "登录",
  description: `登录 ${siteName} 账户`,
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
