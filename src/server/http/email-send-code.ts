import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { checkRateLimit, sendVerificationCode, type VerificationType } from "@/lib/email";

const sendCodeSchema = z.object({
  email: z
    .string()
    .trim()
    .email("请输入有效的邮箱地址")
    .transform((value) => value.toLowerCase()),
  type: z.enum(["REGISTER", "LOGIN", "RESET_PASSWORD", "CHANGE_EMAIL"]),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = sendCodeSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { success: false, message: parsed.error.issues[0]?.message || "参数错误" },
        { status: 400 },
      );
    }

    const { email, type } = parsed.data;

    // 检查频率限制
    const canSend = await checkRateLimit(email);
    if (!canSend) {
      return Response.json(
        { success: false, message: "发送太频繁，请1分钟后重试" },
        { status: 429 },
      );
    }

    const matchingUsers = await db
      .select({ email: schema.user.email })
      .from(schema.user)
      .where(sql`lower(${schema.user.email}) = ${email}`)
      .limit(2);
    if (type === "REGISTER" && matchingUsers.length > 0)
      return Response.json({ success: false, message: "该邮箱已被注册" }, { status: 400 });
    if ((type === "LOGIN" || type === "RESET_PASSWORD") && matchingUsers.length === 0)
      return Response.json({ success: false, message: "该邮箱未注册" }, { status: 400 });
    if (matchingUsers.length > 1)
      return Response.json(
        { success: false, message: "存在大小写冲突的邮箱，请联系站长处理" },
        { status: 409 },
      );

    const result = await sendVerificationCode(
      email,
      type as VerificationType,
      matchingUsers[0]?.email,
    );

    return Response.json(result, {
      status: result.success ? 200 : 500,
    });
  } catch (error) {
    console.error("Send code API error:", error);
    return Response.json({ success: false, message: "服务器错误" }, { status: 500 });
  }
}
