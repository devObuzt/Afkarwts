import { NextResponse } from "next/server";
import { createMessage, getGroup, getMember, listGroupMembers, updateMessageStatus } from "@/app/lib/db";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/app/lib/whatsapp";

export const runtime = "nodejs";
export const maxDuration = 300;

type BulkResult = {
  memberId: number;
  name: string;
  phone: string;
  ok: boolean;
  error: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      groupId?: number;
      memberIds?: number[];
      mode?: "template" | "text";
      text?: string;
      templateName?: string;
      templateLanguage?: string;
      bodyParams?: string[];
      bodyPreview?: string;
    };

    const mode = body.mode === "text" ? "text" : "template";
    const text = body.text?.trim() ?? "";
    const bodyParams = (body.bodyParams ?? []).map((param) => String(param));
    const templateStoredBody =
      body.bodyPreview?.trim() ||
      (body.templateName ? `Template: ${body.templateName}` : "Template message");

    if (mode === "text" && !text) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    let members = [] as ReturnType<typeof listGroupMembers>;

    if (body.groupId) {
      const groupId = Number(body.groupId);
      if (!getGroup(groupId)) {
        return NextResponse.json({ error: "Group not found." }, { status: 404 });
      }
      members = listGroupMembers(groupId);
    } else if (body.memberIds?.length) {
      members = body.memberIds
        .map((id) => getMember(Number(id)))
        .filter((member): member is NonNullable<typeof member> => Boolean(member));
    }

    if (!members.length) {
      return NextResponse.json({ error: "No recipients found." }, { status: 400 });
    }

    if (members.length > 250) {
      return NextResponse.json(
        { error: "Bulk send is limited to 250 recipients at a time (WhatsApp daily limit)." },
        { status: 400 }
      );
    }

    const results: BulkResult[] = [];

    for (const member of members) {
      const pending = createMessage({
        memberId: member.id,
        direction: "outgoing",
        body: mode === "template" ? templateStoredBody : text,
        status: "pending"
      });

      try {
        if (mode === "template") {
          const sent = await sendWhatsAppTemplate(member, {
            name: body.templateName,
            language: body.templateLanguage,
            bodyParams
          });
          updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId: sent.messageId });
        } else {
          const whatsappMessageId = await sendWhatsAppText(member, text);
          updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId });
        }
        results.push({ memberId: member.id, name: member.name, phone: member.phone, ok: true, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "WhatsApp send failed.";
        updateMessageStatus(pending.id, { status: "failed", error: message });
        results.push({ memberId: member.id, name: member.name, phone: member.phone, ok: false, error: message });
      }
    }

    const sent = results.filter((result) => result.ok).length;
    return NextResponse.json({ sent, failed: results.length - sent, results });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
