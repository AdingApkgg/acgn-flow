import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { verificationCode } from "@/db/schema";
import { redis } from "@/lib/redis";

const verifyCodeSchema = z.object({
  email: z
    .string()
    .trim()
    .email("请输入有效的邮箱地址")
    .transform((value) => value.toLowerCase()),
  code: z.string().length(6, "验证码为6位数字"),
  type: z.enum(["REGISTER", "LOGIN", "RESET_PASSWORD", "CHANGE_EMAIL"]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = verifyCodeSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { valid: false, message: parsed.error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    const { email, code, type } = parsed.data;
    const attemptsKey = `email:verify-attempts:${email.toLowerCase()}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 600);
    if (attempts > 10)
      return Response.json({ valid: false, message: "尝试次数过多，请稍后重试" }, { status: 429 });
    const record = await db.query.verificationCode.findFirst({
      where: and(
        eq(verificationCode.email, email),
        eq(verificationCode.code, code),
        eq(verificationCode.type, type),
        eq(verificationCode.used, false),
        gt(verificationCode.expiresAt, new Date()),
      ),
    });
    const result = { valid: !!record, message: record ? "验证成功" : "验证码无效或已过期" };

    return Response.json(result, {
      status: result.valid ? 200 : 400,
    });
  } catch (error) {
    console.error("Verify code API error:", error);
    return Response.json({ valid: false, message: "服务器错误" }, { status: 500 });
  }
}
