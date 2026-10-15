import { NextResponse } from "next/server";
import { getFormByToken } from "@/app/lib/forms/store";
import { checkCode, startVerification, type Channel } from "@/app/lib/forms/verify";

/**
 * A ceiling per source, in front of the shared one.
 *
 * The budget for everyone together stops a runaway, but on its own it
 * hands any single script the power to spend it and lock every real woman
 * out with «الخدمة مشغولة». This makes that cost the script its own quota
 * first. Kept in memory on purpose: it is a speed bump, it resets when the
 * service restarts, and it must never be a reason a registration fails.
 */
const perSource = new Map<string, number[]>();
const SOURCE_PER_HOUR = 12;

function sourceIsOverLimit(request: Request, now: number) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const source = forwarded.split(",")[0].trim() || "unknown";
  const hourAgo = now - 60 * 60 * 1000;
  const seen = (perSource.get(source) ?? []).filter((at) => at > hourAgo);
  if (seen.length >= SOURCE_PER_HOUR) {
    perSource.set(source, seen);
    return true;
  }
  seen.push(now);
  perSource.set(source, seen);
  // Nothing sweeps this map, so it is swept here.
  if (perSource.size > 5000) {
    for (const [key, times] of perSource) {
      if (!times.some((at) => at > hourAgo)) perSource.delete(key);
    }
  }
  return false;
}

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
    if (sourceIsOverLimit(request, Date.now())) {
      return NextResponse.json({ error: "طلبات كثيرة من هذا الجهاز. حاولي بعد قليل." }, { status: 429 });
    }
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
