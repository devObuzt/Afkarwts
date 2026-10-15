import { NextResponse } from "next/server";
import { getFormByToken } from "@/app/lib/forms/store";
import { checkCode, startVerification, type Channel } from "@/app/lib/forms/verify";

export const runtime = "nodejs";

/**
 * Public, like the form it belongs to — so every limit that matters is
 * here and not in the page: how often a number may ask for a code, how
 * many guesses it gets, and how long either lasts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const form = getFormByToken((await params).token);
  if (!form || form.status !== "open") {
    return NextResponse.json({ error: "هذه الاستمارة غير متاحة." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    phone?: string;
    code?: string;
    channel?: string;
  };
  const phone = String(body.phone ?? "");

  if (body.action === "send") {
    const channel: Channel = body.channel === "sms" ? "sms" : "whatsapp";
    const result = await startVerification(form.id, phone, channel);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, retryAfter: result.retryAfter }, { status: 400 });
    }
    return NextResponse.json({ ok: true, channel: result.channel });
  }

  if (body.action === "check") {
    const result = checkCode(form.id, phone, String(body.code ?? ""));
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
