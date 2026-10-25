import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url(),
  APP_URL: z.string().url(),
  APP_NAME: z.string().min(1).default("ACGN Flow"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
  INDEXNOW_KEY: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
});

// 服务端配置只允许在 loader、Hono 和后台业务模块中导入。
export const env = serverSchema.parse({
  ...Object.fromEntries(
    Object.entries(process.env).map(([key, value]) => [key, value || undefined]),
  ),
  AUTH_SECRET: process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET,
  AUTH_URL:
    process.env.BETTER_AUTH_URL ||
    process.env.AUTH_URL ||
    process.env.APP_URL ||
    "http://localhost:3000",
  APP_URL: process.env.APP_URL || "http://localhost:3000",
  APP_NAME: process.env.APP_NAME || "ACGN Flow",
});
