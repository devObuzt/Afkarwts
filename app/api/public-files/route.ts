import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { getPublicFile, listPublicFiles, setPublicFile } from "@/app/lib/db";
import { MAX_MEDIA_BYTES, MAX_MEDIA_LABEL, createStoredMediaFilename, writeMediaFile } from "@/app/lib/media-store";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "video/mp4",
  "audio/mpeg"
]);

export async function GET() {
  const auth = await requireApi("files.view");
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
  // «files.manage», not «messages.send»: this repoints a link that is
  // already inside hundreds of sent messages, which is a heavier thing
  // than writing one.
  const auth = await requireApi("files.manage");
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

  // The type the browser claimed, kept only when it is one this link may
  // serve as itself. Everything else is stored and handed back as untyped
  // bytes — see the inline rule in app/f/[slug]/route.ts.
  const claimed = upload.type || "application/octet-stream";
  const mimeType = ALLOWED_TYPES.has(claimed) ? claimed : "application/octet-stream";
  const previous = getPublicFile(slug.toLowerCase());
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

  // Named in full, including what used to be there: repointing a link
  // that is already in people's hands is the kind of change somebody has
  // to be able to trace afterwards.
  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "member.update",
    subjectType: "member",
    subjectId: 0,
    subjectLabel: `ملف عام /f/${result.file.slug}`,
    detail: previous
      ? `${previous.downloadName || previous.filename} ← ${upload.name}`
      : `جديد: ${upload.name}`
  });

  return NextResponse.json({ file: result.file });
}
