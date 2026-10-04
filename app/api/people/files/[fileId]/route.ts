import { NextResponse } from "next/server";
import { deletePersonFile, renamePersonFile } from "@/app/lib/person-files";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const fileId = Number((await context.params).fileId);
  const body = (await request.json().catch(() => ({}))) as { label?: string; note?: string };

  if (!renamePersonFile(fileId, String(body.label ?? ""), String(body.note ?? ""))) {
    return NextResponse.json({ error: "Give the file a name." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const fileId = Number((await context.params).fileId);

  if (!deletePersonFile(fileId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
