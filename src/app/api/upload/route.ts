import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import sharp from "sharp";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (压缩前)
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

// 图片压缩配置
const IMAGE_CONFIG = {
  avatar: { width: 256, height: 256, quality: 85 },
  cover: { width: 1280, height: 720, quality: 80 },
  misc: { width: 1920, height: 1080, quality: 80 },
} as const;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = formData.get("type") as string | null; // avatar, cover, etc.
    const noCompress = formData.get("noCompress") === "true"; // 是否跳过压缩

    if (!file) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "不支持的文件类型，请上传 JPG、PNG、GIF、WebP 或 AVIF 格式" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "文件大小不能超过 10MB" },
        { status: 400 }
      );
    }

    // 创建上传目录
    const uploadType = type || "misc";
    const uploadPath = join(UPLOAD_DIR, uploadType);
    if (!existsSync(uploadPath)) {
      await mkdir(uploadPath, { recursive: true });
    }

    // 读取文件
    const bytes = await file.arrayBuffer();
    const inputBuffer = Buffer.from(bytes);
    const originalSize = inputBuffer.length;

    let outputBuffer: Buffer;
    let outputExt: string;
    let metadata: { width?: number; height?: number } = {};

    // 使用 sharp 压缩图片（GIF 保持原样）
    if (file.type === "image/gif" || noCompress) {
      // GIF 不压缩，保持动图
      outputBuffer = inputBuffer;
      outputExt = file.name.split(".").pop() || "gif";
    } else {
      const config = IMAGE_CONFIG[uploadType as keyof typeof IMAGE_CONFIG] || IMAGE_CONFIG.misc;
      
      try {
        // 获取原始图片信息
        const imageInfo = await sharp(inputBuffer).metadata();
        metadata = { width: imageInfo.width, height: imageInfo.height };
        
        // 使用 sharp 进行智能压缩
        let sharpInstance = sharp(inputBuffer, { animated: false });
        
        // 根据类型调整尺寸
        if (uploadType === "avatar") {
          // 头像：裁剪为正方形
          sharpInstance = sharpInstance
            .resize(config.width, config.height, {
              fit: "cover",
              position: "centre",
            });
        } else {
          // 封面和其他：保持比例缩小
          sharpInstance = sharpInstance
            .resize(config.width, config.height, {
              fit: "inside",
              withoutEnlargement: true,
            });
        }
        
        // 转换为 WebP 格式（体积最小）
        outputBuffer = await sharpInstance
          .webp({ quality: config.quality, effort: 4 })
          .toBuffer();
        outputExt = "webp";
        
        // 如果 WebP 比原图大，回退到原格式
        if (outputBuffer.length > originalSize * 0.95) {
          if (file.type === "image/jpeg") {
            outputBuffer = await sharp(inputBuffer)
              .resize(config.width, config.height, {
                fit: uploadType === "avatar" ? "cover" : "inside",
                withoutEnlargement: true,
              })
              .jpeg({ quality: config.quality, mozjpeg: true })
              .toBuffer();
            outputExt = "jpg";
          } else if (file.type === "image/png") {
            outputBuffer = await sharp(inputBuffer)
              .resize(config.width, config.height, {
                fit: uploadType === "avatar" ? "cover" : "inside",
                withoutEnlargement: true,
              })
              .png({ compressionLevel: 9, adaptiveFiltering: true })
              .toBuffer();
            outputExt = "png";
          }
        }
      } catch (sharpError) {
        console.error("Sharp processing error:", sharpError);
        // 压缩失败时使用原图
        outputBuffer = inputBuffer;
        outputExt = file.name.split(".").pop() || "jpg";
      }
    }

    // 生成文件名
    const filename = `${session.user.id}-${Date.now()}.${outputExt}`;
    const filepath = join(uploadPath, filename);

    // 保存文件
    await writeFile(filepath, outputBuffer);

    // 计算压缩率
    const compressedSize = outputBuffer.length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    // 返回访问 URL
    const url = `/uploads/${uploadType}/${filename}`;

    return NextResponse.json({
      url,
      success: true,
      originalSize,
      compressedSize,
      compressionRatio: `${compressionRatio}%`,
      format: outputExt,
      dimensions: metadata,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
