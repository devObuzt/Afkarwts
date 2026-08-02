import { NextResponse } from "next/server";
import { createMessage, getMember, updateMessageStatus } from "@/app/lib/db";
import { sendWhatsAppTemplate } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      memberId?: number;
      templateName?: string;
      templateLanguage?: string;
      bodyParams?: string[];
      bodyPreview?: string;
    };
    const memberId = Number(body.memberId);

    if (!Number.isInteger(memberId)) {
      return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    }

    const member = getMember(memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const bodyParams = (body.bodyParams ?? []).map((param) => String(param));
    const storedBody =
      body.bodyPreview?.trim() ||
      (body.templateName ? `Template: ${body.templateName}` : "Template message");

    const pending = createMessage({
      memberId,
      direction: "outgoing",
      body: storedBody,
      status: "pending"
    });

    try {
      const result = await sendWhatsAppTemplate(member, {
        name: body.templateName,
        language: body.templateLanguage,
        bodyParams
      });
      const message = updateMessageStatus(pending.id, {
        status: "accepted",
        whatsappMessageId: result.messageId
      });
      return NextResponse.json({ message });
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
