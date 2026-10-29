import { NextResponse } from "next/server";
import { handleWebhookPayload, type WhatsAppWebhookPayload } from "@/app/lib/whatsapp-webhook";
import { verifyMetaSignature } from "@/app/lib/whatsapp/verify-signature";
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
  // الجسم الخام قبل أي تحليل: التوقيع محسوب على البايتات زي ما بعتتهن
  // ميتا، و`JSON.parse` ثم `stringify` بيغيّر المسافات فبيكسر المقارنة.
  const raw = await request.text();
  const signature = verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"));

  // السرّ مضبوط ← الرابط مقفول: حمولة بلا توقيع صحيح ما بتفوت أصلاً.
  if (signature.configured && !signature.valid) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(raw) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Bad payload." }, { status: 400 });
  }

  // السرّ مش مضبوط ← الرسائل بتنخزّن زي ما كانت (بلا تراجع عن سلوك
  // قائم)، بس **ولا رسالة بتطلع**: الإرسال الآلي من حمولة ما قدرنا
  // نتحقق منها بيخلّي رقم أفكار أداة بإيد أي حدا بيعرف الرابط.
  await handleWebhookPayload(payload, { verified: signature.valid });

  return NextResponse.json({ ok: true });
}
