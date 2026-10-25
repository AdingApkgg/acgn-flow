import { randomInt } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import Handlebars from "handlebars";
import { nanoid } from "nanoid";
import nodemailer from "nodemailer";
import { db } from "@/db";
import { verificationCode } from "@/db/schema";
import { redis } from "@/lib/redis";

// 创建邮件传输器
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "465", 10),
  secure: parseInt(process.env.SMTP_PORT || "465", 10) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

// 邮件模板
const templates = {
  verificationCode: Handlebars.compile(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>验证码</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">{{siteName}}</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px; color: #18181b; font-size: 24px; font-weight: 600;">{{title}}</h2>
              <p style="margin: 0 0 30px; color: #52525b; font-size: 16px; line-height: 1.6;">
                {{description}}
              </p>
              <!-- Verification Code Box -->
              <div style="background-color: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 30px;">
                <p style="margin: 0 0 10px; color: #71717a; font-size: 14px;">您的验证码是</p>
                <div style="font-size: 36px; font-weight: 700; color: #6366f1; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                  {{code}}
                </div>
                <p style="margin: 10px 0 0; color: #a1a1aa; font-size: 12px;">验证码 {{expireMinutes}} 分钟内有效</p>
              </div>
              <p style="margin: 0; color: #71717a; font-size: 14px; line-height: 1.6;">
                如果您没有请求此验证码，请忽略此邮件。
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e4e4e7;">
              <p style="margin: 0; color: #a1a1aa; font-size: 12px;">
                此邮件由系统自动发送，请勿直接回复。
              </p>
              <p style="margin: 10px 0 0; color: #a1a1aa; font-size: 12px;">
                © {{year}} {{siteName}}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `),
};

// 验证码类型
export type VerificationType = "REGISTER" | "LOGIN" | "RESET_PASSWORD" | "CHANGE_EMAIL";

// 生成6位数字验证码
function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

// 发送验证码邮件
export async function sendVerificationCode(
  email: string,
  type: VerificationType,
  recipient?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟后过期

    email = email.trim().toLowerCase();
    const allowed = await db.transaction(async (tx) => {
      // 同一邮箱的发送串行化，防止并发请求绕过一分钟间隔。
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
      const recent = await tx.query.verificationCode.findFirst({
        where: and(
          eq(verificationCode.email, email),
          gt(verificationCode.createdAt, new Date(Date.now() - 60_000)),
        ),
        columns: { id: true },
      });
      if (recent) return false;
      await tx
        .delete(verificationCode)
        .where(and(eq(verificationCode.email, email), eq(verificationCode.type, type)));
      await tx.insert(verificationCode).values({ id: nanoid(), email, code, type, expiresAt });
      return true;
    });
    if (!allowed) return { success: false, message: "请稍后再发送验证码" };

    // 根据类型设置邮件内容
    const typeConfig: Record<VerificationType, { title: string; description: string }> = {
      REGISTER: {
        title: "注册验证",
        description: "感谢您注册我们的服务！请使用以下验证码完成注册。",
      },
      LOGIN: {
        title: "登录验证",
        description: "您正在尝试登录账户，请使用以下验证码完成登录。",
      },
      RESET_PASSWORD: {
        title: "重置密码",
        description: "您正在重置密码，请使用以下验证码继续操作。",
      },
      CHANGE_EMAIL: {
        title: "更换邮箱",
        description: "您正在更换绑定邮箱，请使用以下验证码验证新邮箱。",
      },
    };

    const config = typeConfig[type];
    const siteName = process.env.APP_NAME || "ACGN Flow";

    const html = templates.verificationCode({
      siteName,
      title: config.title,
      description: config.description,
      code,
      expireMinutes: 10,
      year: new Date().getFullYear(),
    });

    await transporter.sendMail({
      from: `"${siteName}" <${process.env.SMTP_FROM}>`,
      to: recipient || email,
      subject: `【${siteName}】${config.title} - 验证码: ${code}`,
      html,
    });

    return { success: true, message: "验证码已发送" };
  } catch (error) {
    console.error("Send verification code error:", error);
    return { success: false, message: "发送验证码失败，请稍后重试" };
  }
}

// 邮件预检只读；最终注册、重置和换邮箱必须在其数据库事务内消费验证码。
export async function verifyCode(
  email: string,
  code: string,
  type: VerificationType,
): Promise<{ valid: boolean; message: string }> {
  const record = await db.query.verificationCode.findFirst({
    where: and(
      eq(verificationCode.email, email.trim().toLowerCase()),
      eq(verificationCode.code, code),
      eq(verificationCode.type, type),
      gt(verificationCode.expiresAt, new Date()),
      eq(verificationCode.used, false),
    ),
    columns: { id: true },
  });
  return { valid: Boolean(record), message: record ? "验证成功" : "验证码无效或已过期" };
}

type VerificationWriter = Pick<typeof db, "update">;

// UPDATE 的条件和返回行共同保证并发请求中只有一次消费成功。
export async function consumeVerificationCode(
  database: VerificationWriter,
  email: string,
  code: string,
  type: VerificationType,
): Promise<boolean> {
  const attemptKey = `verification:attempts:${type}:${email.trim().toLowerCase()}`;
  const attempts = await redis.incr(attemptKey);
  if (attempts === 1) await redis.expire(attemptKey, 600);
  if (attempts > 10) return false;
  const consumed = await database
    .update(verificationCode)
    .set({ used: true })
    .where(
      and(
        eq(verificationCode.email, email.trim().toLowerCase()),
        eq(verificationCode.code, code),
        eq(verificationCode.type, type),
        gt(verificationCode.expiresAt, new Date()),
        eq(verificationCode.used, false),
      ),
    )
    .returning({ id: verificationCode.id });
  return consumed.length > 0;
}

export async function checkRateLimit(email: string): Promise<boolean> {
  const record = await db.query.verificationCode.findFirst({
    where: and(
      eq(verificationCode.email, email.trim().toLowerCase()),
      gt(verificationCode.createdAt, new Date(Date.now() - 60_000)),
    ),
    columns: { id: true },
  });
  return !record;
}
