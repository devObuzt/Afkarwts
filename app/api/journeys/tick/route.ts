import { NextResponse } from "next/server";
import { runDueJourneys } from "@/app/lib/journeys/runner";
import { isLive } from "@/app/lib/outbound-guard";
import "@/app/lib/scheduler";

export const runtime = "nodejs";

// Public endpoint for an external cron as a safety net, the same shape as the
// campaigns tick. Running it twice is harmless: a step is claimed once.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!key || key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Time travel exists only where nothing can be sent.
  const nowParam = isLive() ? null : url.searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();

  if (Number.isNaN(now.getTime())) {
    return NextResponse.json({ error: "Invalid now." }, { status: 400 });
  }

  const totals = await runDueJourneys(now);
  return NextResponse.json({ ok: true, at: now.toISOString(), ...totals });
}
