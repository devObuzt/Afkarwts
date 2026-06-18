import { NextResponse } from "next/server";
import { createMessage, findOrCreateMemberByPhone, updateMessageStatusByWhatsAppId, type Message } from "@/app/lib/db";

export const runtime = "nodejs";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id?: string;
          profile?: { name?: string };
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: "sent" | "delivered" | "read" | "failed";
          errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
        }>;
      };
    }>;
  }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const contactsByWaId = new Map(
        (value?.contacts ?? []).map((contact) => [
          contact.wa_id,
          contact.profile?.name
        ])
      );

      for (const incoming of value?.messages ?? []) {
        if (!incoming.from || incoming.type !== "text" || !incoming.text?.body) {
          continue;
        }

        const member = findOrCreateMemberByPhone({
          phone: incoming.from,
          profileName: contactsByWaId.get(incoming.from)
        });

        createMessage({
          memberId: member.id,
          direction: "incoming",
          body: incoming.text.body,
          whatsappMessageId: incoming.id ?? null,
          status: "received"
        });
      }

      for (const statusUpdate of value?.statuses ?? []) {
        if (!statusUpdate.id || !statusUpdate.status) {
          continue;
        }

        const error = statusUpdate.errors?.[0];
        const errorText = error
          ? [error.title, error.message, error.error_data?.details].filter(Boolean).join(" - ")
          : null;

        updateMessageStatusByWhatsAppId(statusUpdate.id, {
          status: statusUpdate.status as Message["status"],
          error: errorText
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
