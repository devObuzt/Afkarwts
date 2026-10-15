import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { requireApi } from "@/app/lib/users/current";
import { saveTemplateHeader, templateHeaderFile } from "@/app/lib/template-media";

export const runtime = "nodejs";

/**
 * Public on purpose: Meta fetches this itself when the template goes out,
 * and it arrives with no cookie of ours. What it serves is the picture
 * that is already printed on every copy of that template — nothing here
 * is private.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const file = templateHeaderFile((await params).name);
  if (!file) {
    return NextResponse.json({ error: "No header image for this template." }, { status: 404 });
  }
  return new Response(new Uint8Array(readFileSync(file.path)), {
    headers: { "Content-Type": file.mime, "Cache-Control": "public, max-age=3600" }
  });
}

/** Setting it is not public. */
export async function POST(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await requireApi("templates.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "أرفق صورة." }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "الصورة أكبر من 5 ميجا." }, { status: 400 });
  }
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  if (!["image/png", "image/jpeg"].includes(file.type)) {
    return NextResponse.json({ error: "الصورة يجب أن تكون JPG أو PNG." }, { status: 400 });
  }

  const saved = saveTemplateHeader((await params).name, new Uint8Array(await file.arrayBuffer()), mime);
  return NextResponse.json({ ok: true, file: saved });
}
