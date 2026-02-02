import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "忘记密码",
  description: "重置您的账户密码",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
