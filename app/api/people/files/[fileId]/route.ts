import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { deletePersonFile, getPersonFile, renamePersonFile } from "@/app/lib/person-files";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ fileId: string }> }) {
  const auth = await requireApi("files.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const fileId = Number((await context.params).fileId);
  const body = (await request.json().catch(() => ({}))) as { label?: string; note?: string };

  if (!renamePersonFile(fileId, String(body.label ?? ""), String(body.note ?? ""))) {
    return NextResponse.json({ error: "Give the file a name." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ fileId: string }> }) {
  const auth = await requireApi("files.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const fileId = Number((await context.params).fileId);
  // Read it before it is gone, so the log can name what was deleted.
  const file = getPersonFile(fileId);

  if (!deletePersonFile(fileId)) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "file.delete",
    subjectType: "member",
    subjectId: file?.memberId ?? "",
    subjectLabel: file?.label ?? String(fileId)
  });

  return NextResponse.json({ ok: true });
}
