import { NextResponse } from "next/server";
import { runDueCampaigns } from "@/app/lib/campaigns";
import "@/app/lib/scheduler";

export const runtime = "nodejs";

// Public endpoint for an external cron as a safety net. Requires the verify
// token so strangers cannot trigger sends; running is idempotent per 24h.
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await runDueCampaigns(24);
  return NextResponse.json({ ok: true });
}
