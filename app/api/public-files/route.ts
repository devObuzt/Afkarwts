import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { listPublicFiles, setPublicFile } from "@/app/lib/db";
import { MAX_MEDIA_BYTES, MAX_MEDIA_LABEL, createStoredMediaFilename, writeMediaFile } from "@/app/lib/media-store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("messages.send");
  if (!auth.ok) {
    return auth.response;
  }
  return NextResponse.json({ files: listPublicFiles() });
}

/**
 * Put a file behind a link that is already in people's hands.
 *
 * Upload and repoint are the same call on purpose: a slug whose file is
 * missing is the failure this exists to prevent, so there is no way to
 * create one half of it.
 */
export async function POST(request: Request) {
  const auth = await requireApi("messages.send");
  if (!auth.ok) {
    return auth.response;
  }

  const form = await request.formData().catch(() => null);
  const upload = form?.get("file");
  const slug = String(form?.get("slug") ?? "").trim();
  const label = String(form?.get("label") ?? "").trim();

  if (!(upload instanceof File) || !upload.size) {
    return NextResponse.json({ error: "وين الملف؟" }, { status: 400 });
  }
  if (upload.size > MAX_MEDIA_BYTES) {
    return NextResponse.json({ error: `الملف أكبر من ${MAX_MEDIA_LABEL}.` }, { status: 413 });
  }

  const mimeType = upload.type || "application/octet-stream";
  const filename = createStoredMediaFilename({ mimeType, originalName: upload.name });
  writeMediaFile(filename, new Uint8Array(await upload.arrayBuffer()));

  const result = setPublicFile({
    slug,
    filename,
    label,
    mimeType,
    downloadName: upload.name
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "member.update",
    subjectType: "member",
    subjectId: 0,
    subjectLabel: `ملف عام /f/${result.file.slug}`,
    detail: upload.name
  });

  return NextResponse.json({ file: result.file });
}
