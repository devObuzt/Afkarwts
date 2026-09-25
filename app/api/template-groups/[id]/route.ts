import { NextResponse } from "next/server";
import { assignToGroup, deleteGroup, removeFromGroup, renameGroup } from "@/app/lib/template-catalogue";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { action?: string; templateName?: string; name?: string };

  if (body.action === "assign" && body.templateName) {
    assignToGroup(id, body.templateName);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "remove" && body.templateName) {
    removeFromGroup(id, body.templateName);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "rename" && body.name) {
    renameGroup(id, body.name);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteGroup(Number((await params).id));
  return NextResponse.json({ ok: true });
}
