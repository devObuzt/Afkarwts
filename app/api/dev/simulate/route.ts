import { NextResponse } from "next/server";
import { getMember } from "@/app/lib/db";
import { isLive } from "@/app/lib/outbound-guard";
import { buildIncomingPayload, buildStatusPayload, handleWebhookPayload } from "@/app/lib/whatsapp-webhook";

export const runtime = "nodejs";

type Body =
  | { type: "incoming"; memberId: number; text: string }
  | { type: "status"; whatsappMessageId: string; status: "sent" | "delivered" | "read" | "failed"; error?: string };

export async function POST(request: Request) {
  // The simulator does not exist in production.
  if (isLive()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const key = new URL(request.url).searchParams.get("key");
  if (!key || key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as Body;

  if (body.type === "incoming") {
    const member = getMember(body.memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    await handleWebhookPayload(buildIncomingPayload({ phone: member.phone, text: body.text }));
    return NextResponse.json({ ok: true });
  }

  if (body.type === "status") {
    await handleWebhookPayload(buildStatusPayload(body));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown type." }, { status: 400 });
}
