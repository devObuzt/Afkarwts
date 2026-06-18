import { NextResponse } from "next/server";
import { createMessage, getMember, updateMessageStatus } from "@/app/lib/db";
import { sendWhatsAppText } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { memberId?: number; text?: string };
    const memberId = Number(body.memberId);
    const text = body.text?.trim() ?? "";

    if (!Number.isInteger(memberId)) {
      return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    }

    if (!text) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    const member = getMember(memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const pending = createMessage({
      memberId,
      direction: "outgoing",
      body: text,
      status: "pending"
    });

    try {
      const whatsappMessageId = await sendWhatsAppText(member, text);
      const message = updateMessageStatus(pending.id, {
        status: "accepted",
        whatsappMessageId
      });
      return NextResponse.json({ message });
    } catch (error) {
      const message = updateMessageStatus(pending.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "WhatsApp send failed."
      });
      return NextResponse.json({ message, error: message.error }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
