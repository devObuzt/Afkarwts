import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { markMessageUnread } from "@/app/lib/db";

export const runtime = "nodejs";

/** Reopen a conversation from one of her messages. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  const memberId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as { messageId?: number };
  const messageId = Number(body.messageId);

  if (!Number.isInteger(memberId) || !Number.isInteger(messageId)) {
    return NextResponse.json({ error: "أي رسالة؟" }, { status: 400 });
  }

  const result = markMessageUnread(memberId, messageId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ member: result.member });
}
