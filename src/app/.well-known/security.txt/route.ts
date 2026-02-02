import { NextResponse } from "next/server";

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://af.saop.cc";
  
  // 安全联系信息（符合 RFC 9116 规范）
  const securityTxt = `# Security Policy for ACGN Flow
# https://securitytxt.org/

Contact: mailto:security@saop.cc
Contact: ${baseUrl}/security
Expires: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()}
Preferred-Languages: zh, en
Canonical: ${baseUrl}/.well-known/security.txt

# 感谢您帮助我们保持网站安全！
# Thank you for helping us keep our site secure!
`;

  return new NextResponse(securityTxt, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
