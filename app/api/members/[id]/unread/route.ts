import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { lastIncomingMessageId, markMessageUnread } from "@/app/lib/db";

export const runtime = "nodejs";

/**
 * Reopen a conversation — from one of her messages, or from the whole
 * thread when no message is named.
 *
 * The header button is the second case: «treat this as if we never opened
 * it» is about the conversation, not about a bubble, and making the
 * screen pick the right message id for that would be a second place where
 * «the last thing she said» is defined.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  const memberId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as { messageId?: number };
  if (!Number.isInteger(memberId)) {
    return NextResponse.json({ error: "أي محادثة؟" }, { status: 400 });
  }

  const messageId = body.messageId === undefined ? lastIncomingMessageId(memberId) : Number(body.messageId);
  if (messageId === null || !Number.isInteger(messageId)) {
    return NextResponse.json({ error: "ما في ولا رسالة واردة بهالمحادثة." }, { status: 400 });
  }

  const result = markMessageUnread(memberId, messageId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ member: result.member });
}
