import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const BOARD_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const BOARD_IMAGE_TYPES = {
  "image/jpeg": { extension: "jpg", signature: isJpeg },
  "image/png": { extension: "png", signature: isPng },
  "image/gif": { extension: "gif", signature: isGif },
  "image/webp": { extension: "webp", signature: isWebp },
} as const;

export type BoardImageMimeType = keyof typeof BOARD_IMAGE_TYPES;

export class BoardImageUploadError extends Error {
  constructor(
    message: string,
    readonly code:
      | "r2_not_configured"
      | "invalid_image_type"
      | "image_too_large"
      | "invalid_image_data"
      | "upload_rate_limited"
  ) {
    super(message);
    this.name = "BoardImageUploadError";
  }
}

function getRequiredEnv(name: string) {
  return String(process.env[name] || "").trim();
}

function getR2Config() {
  const accountId = getRequiredEnv("R2_ACCOUNT_ID");
  const accessKeyId = getRequiredEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getRequiredEnv("R2_SECRET_ACCESS_KEY");
  const bucketName = getRequiredEnv("R2_BUCKET_NAME");
  const publicBaseUrl = getRequiredEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicBaseUrl) {
    throw new BoardImageUploadError("R2 image upload is not configured.", "r2_not_configured");
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
  };
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isGif(bytes: Uint8Array) {
  if (bytes.length < 6) return false;
  const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
  return header === "GIF87a" || header === "GIF89a";
}

function isWebp(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const riff = Buffer.from(bytes.subarray(0, 4)).toString("ascii");
  const webp = Buffer.from(bytes.subarray(8, 12)).toString("ascii");
  return riff === "RIFF" && webp === "WEBP";
}

function getBoardImageMimeType(file: File): BoardImageMimeType {
  if (file.type in BOARD_IMAGE_TYPES) return file.type as BoardImageMimeType;
  throw new BoardImageUploadError("jpg, png, gif, webp 이미지만 업로드할 수 있습니다.", "invalid_image_type");
}

function assertValidImageSignature(bytes: Uint8Array, mimeType: BoardImageMimeType) {
  if (!BOARD_IMAGE_TYPES[mimeType].signature(bytes)) {
    throw new BoardImageUploadError("이미지 파일 형식을 확인해 주세요.", "invalid_image_data");
  }
}

function buildBoardImageKey(extension: string) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `board/${yyyy}/${mm}/${randomUUID()}.${extension}`;
}

function createR2Client(config: ReturnType<typeof getR2Config>) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export async function uploadBoardImageToR2(file: File) {
  if (file.size > BOARD_IMAGE_MAX_BYTES) {
    throw new BoardImageUploadError("이미지는 5MB 이하로 올려 주세요.", "image_too_large");
  }

  const mimeType = getBoardImageMimeType(file);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertValidImageSignature(bytes, mimeType);

  const config = getR2Config();
  const key = buildBoardImageKey(BOARD_IMAGE_TYPES[mimeType].extension);
  const client = createR2Client(config);

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: Buffer.from(bytes),
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return {
    key,
    url: `${config.publicBaseUrl}/${key}`,
  };
}
