import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    AUTH_SECRET: z.string().min(1),
    AUTH_URL: z.string().url().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().email().optional(),
    UPLOAD_DIR: z.string().default("./uploads"),
    INDEXNOW_KEY: z.string().optional(),
    // Google Indexing API (可选)
    GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
    GOOGLE_PRIVATE_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_APP_NAME: z.string().default("ACGN Flow"),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
    INDEXNOW_KEY: process.env.INDEXNOW_KEY,
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
