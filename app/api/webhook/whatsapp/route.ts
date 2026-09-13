import { NextResponse } from "next/server";
import { handleWebhookPayload, type WhatsAppWebhookPayload } from "@/app/lib/whatsapp-webhook";
import "@/app/lib/scheduler";

export const runtime = "nodejs";

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
  await handleWebhookPayload(payload);
  return NextResponse.json({ ok: true });
}
