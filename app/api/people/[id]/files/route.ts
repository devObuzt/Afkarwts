import { NextResponse } from "next/server";
import { getMember } from "@/app/lib/db";
import {
  FILE_KINDS,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  listPersonFiles,
  savePersonFile,
  type PersonFileKind
} from "@/app/lib/person-files";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const memberId = Number((await context.params).id);
  if (!getMember(memberId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ files: listPersonFiles(memberId) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const memberId = Number((await context.params).id);
  if (!getMember(memberId)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const upload = form?.get("file");

  if (!form || !(upload instanceof File) || upload.size === 0) {
    return NextResponse.json({ error: "Pick a file to upload." }, { status: 400 });
  }

  if (upload.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `A file can be up to ${MAX_FILE_LABEL}.` }, { status: 400 });
  }

  const requested = String(form.get("kind") ?? "other") as PersonFileKind;
  const kind = FILE_KINDS.includes(requested) ? requested : "other";

  const file = savePersonFile({
    memberId,
    kind,
    label: String(form.get("label") ?? ""),
    originalName: upload.name,
    mimeType: upload.type || "application/octet-stream",
    bytes: new Uint8Array(await upload.arrayBuffer()),
    note: String(form.get("note") ?? "")
  });

  return NextResponse.json({ file });
}
