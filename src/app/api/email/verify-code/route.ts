import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCode, type VerificationType } from "@/lib/email";

const verifyCodeSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  code: z.string().length(6, "验证码为6位数字"),
  type: z.enum(["REGISTER", "LOGIN", "RESET_PASSWORD", "CHANGE_EMAIL"]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = verifyCodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { valid: false, message: parsed.error.issues[0]?.message || "参数错误" },
        { status: 400 }
      );
    }

    const { email, code, type } = parsed.data;
    const result = await verifyCode(email, code, type as VerificationType);

    return NextResponse.json(result, {
      status: result.valid ? 200 : 400,
    });
  } catch (error) {
    console.error("Verify code API error:", error);
    return NextResponse.json(
      { valid: false, message: "服务器错误" },
      { status: 500 }
    );
  }
}
