import { NextResponse } from "next/server";
import { sendTelegramMessage } from "@/app/lib/telegram";
import { formatDailyDigest, journeyLabel, stepBreakdown } from "@/app/lib/journeys/report";
import { listActiveJourneys } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

/** Called once a day by the scheduled task; also safe to call by hand. */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!key || key !== process.env.WHATSAPP_VERIFY_TOKEN) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const journeys = listActiveJourneys();
  const alerts: string[] = [];

  for (const journey of journeys) {
    await sendTelegramMessage(formatDailyDigest(journey.id));

    const { name } = journeyLabel(journey.id);
    for (const step of stepBreakdown(journey.id)) {
      const attempts = step.sentText + step.sentTemplate + step.failed;
      // A step failing for a fifth of its sends points at our side, not theirs.
      if (attempts > 0 && step.failed / attempts > 0.2) {
        alerts.push(`⚠️ «${name}» · ${step.label}: ${step.failed} فشل من ${attempts}`);
      }
      if (step.missed > 0) {
        alerts.push(`⚠️ «${name}» · ${step.label}: ${step.missed} فاتت بلا إرسال`);
      }
      if (step.stuck > 0) {
        alerts.push(`⚠️ «${name}» · ${step.label}: ${step.stuck} معلّقة من غير تسجيل`);
      }
    }
  }

  if (alerts.length) {
    await sendTelegramMessage(alerts.join("\n"));
  }

  return NextResponse.json({ ok: true, journeys: journeys.length, alerts: alerts.length });
}
