import { NextResponse } from "next/server";
import { getMember, listMessages } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const memberId = Number(params.id);

  if (!Number.isInteger(memberId)) {
    return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
  }

  const member = getMember(memberId);
  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  return NextResponse.json({ member, messages: listMessages(memberId) });
}

