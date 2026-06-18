import { NextResponse } from "next/server";
import { createMessage, getMember, updateMessageStatus } from "@/app/lib/db";
import { sendWhatsAppTemplate } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { memberId?: number };
    const memberId = Number(body.memberId);

    if (!Number.isInteger(memberId)) {
      return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    }

    const member = getMember(memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const pending = createMessage({
      memberId,
      direction: "outgoing",
      body: "Template message",
      status: "pending"
    });

    try {
      const result = await sendWhatsAppTemplate(member);
      const message = updateMessageStatus(pending.id, {
        status: "accepted",
        whatsappMessageId: result.messageId
      });
      return NextResponse.json({
        message: {
          ...message,
          body: `Template: ${result.templateName} (${result.templateLanguage})`
        }
      });
    } catch (error) {
      const message = updateMessageStatus(pending.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "WhatsApp template send failed."
      });
      return NextResponse.json({ message, error: message.error }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
