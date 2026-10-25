-- main 新增的 Flash 类型；冻结的 209 列基线不回写，已有类型和值完整保留。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = current_schema() AND t.typname = 'ContentType'
  ) THEN
    CREATE TYPE "ContentType" AS ENUM ('VIDEO', 'FLASH');
  END IF;
END;
$$;

ALTER TABLE "Video" ADD COLUMN IF NOT EXISTS "contentType" "ContentType" NOT NULL DEFAULT 'VIDEO';
