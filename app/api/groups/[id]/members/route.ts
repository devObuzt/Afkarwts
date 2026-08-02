import { NextResponse } from "next/server";
import { addMembersToGroup, getGroup, removeMemberFromGroup } from "@/app/lib/db";

export const runtime = "nodejs";

function parseGroupId(id: string) {
  const groupId = Number(id);
  return Number.isInteger(groupId) && groupId > 0 ? groupId : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const groupId = parseGroupId((await params).id);
  if (!groupId || !getGroup(groupId)) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { memberIds?: number[] };
    const memberIds = (body.memberIds ?? []).map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (!memberIds.length) {
      return NextResponse.json({ error: "memberIds is required." }, { status: 400 });
    }

    addMembersToGroup(groupId, memberIds);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const groupId = parseGroupId((await params).id);
  if (!groupId || !getGroup(groupId)) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { memberId?: number };
    const memberId = Number(body.memberId);
    if (!Number.isInteger(memberId)) {
      return NextResponse.json({ error: "memberId is required." }, { status: 400 });
    }

    removeMemberFromGroup(groupId, memberId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
