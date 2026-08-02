import { NextResponse } from "next/server";
import { deleteGroup, getGroup, renameGroup } from "@/app/lib/db";

export const runtime = "nodejs";

function parseGroupId(id: string) {
  const groupId = Number(id);
  return Number.isInteger(groupId) && groupId > 0 ? groupId : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const groupId = parseGroupId((await params).id);
  if (!groupId || !getGroup(groupId)) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { name?: string };
    renameGroup(groupId, body.name ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not rename group.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const groupId = parseGroupId((await params).id);
  if (!groupId || !getGroup(groupId)) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  deleteGroup(groupId);
  return NextResponse.json({ ok: true });
}
