import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const extensionByMime: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "video/quicktime": "mov",
  "application/pdf": "pdf"
};

export function getDataDir() {
  const dataDir = process.env.APP_DATA_DIR || path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function getMediaDir() {
  const mediaDir = path.join(getDataDir(), "media");
  mkdirSync(mediaDir, { recursive: true });
  return mediaDir;
}

export function safeMediaFilename(filename: string) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function extensionForMime(mimeType: string, fallbackName?: string) {
  const fromMime = extensionByMime[mimeType];
  if (fromMime) {
    return fromMime;
  }

  const fromName = fallbackName ? path.extname(fallbackName).replace(".", "") : "";
  return fromName || "bin";
}

export function createStoredMediaFilename(input: {
  messageId?: string | null;
  mimeType: string;
  originalName?: string | null;
}) {
  const idPart = input.messageId ? safeMediaFilename(input.messageId) : `${Date.now()}`;
  const extension = extensionForMime(input.mimeType, input.originalName ?? undefined);
  return `${idPart}.${extension}`;
}

export function writeMediaFile(filename: string, bytes: Uint8Array) {
  const safeName = safeMediaFilename(filename);
  const fullPath = path.join(getMediaDir(), safeName);
  writeFileSync(fullPath, bytes);
  return `/api/media/${safeName}`;
}

export function readMediaFile(filename: string) {
  const safeName = safeMediaFilename(filename);
  return readFileSync(path.join(getMediaDir(), safeName));
}
