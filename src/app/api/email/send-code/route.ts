import { NextResponse } from "next/server";
import { z } from "zod";
import { sendVerificationCode, checkRateLimit, type VerificationType } from "@/lib/email";
import { prisma } from "@/lib/prisma";

const sendCodeSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  type: z.enum(["REGISTER", "LOGIN", "RESET_PASSWORD", "CHANGE_EMAIL"]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = sendCodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, message: parsed.error.issues[0]?.message || "参数错误" },
        { status: 400 }
      );
    }

    const { email, type } = parsed.data;

    // 检查频率限制
    const canSend = await checkRateLimit(email);
    if (!canSend) {
      return NextResponse.json(
        { success: false, message: "发送太频繁，请1分钟后重试" },
        { status: 429 }
      );
    }

    // 注册时检查邮箱是否已存在
    if (type === "REGISTER") {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        return NextResponse.json(
          { success: false, message: "该邮箱已被注册" },
          { status: 400 }
        );
      }
    }

    // 登录/重置密码时检查邮箱是否存在
    if (type === "LOGIN" || type === "RESET_PASSWORD") {
      const user = await prisma.user.findUnique({
        where: { email },
      });
      if (!user) {
        return NextResponse.json(
          { success: false, message: "该邮箱未注册" },
          { status: 400 }
        );
      }
    }

    const result = await sendVerificationCode(email, type as VerificationType);
    
    return NextResponse.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("Send code API error:", error);
    return NextResponse.json(
      { success: false, message: "服务器错误" },
      { status: 500 }
    );
  }
}
