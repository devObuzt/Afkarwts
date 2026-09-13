import { NextResponse } from "next/server";
import { createJourney, listJourneys } from "@/app/lib/journeys/store";
import { journeyFunnel, journeyLabel } from "@/app/lib/journeys/report";

export const runtime = "nodejs";

export async function GET() {
  const journeys = listJourneys().map((journey) => ({
    ...journey,
    ...journeyLabel(journey.id),
    funnel: journeyFunnel(journey.id)
  }));
  return NextResponse.json({ journeys });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { templateId?: number; groupId?: number; anchorDate?: string };

  if (!body.templateId || !body.groupId || !body.anchorDate) {
    return NextResponse.json({ error: "لازم مسار ومجموعة وتاريخ بداية." }, { status: 400 });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.anchorDate)) {
    return NextResponse.json({ error: "تاريخ البداية لازم يكون YYYY-MM-DD." }, { status: 400 });
  }

  return NextResponse.json({
    journey: createJourney({
      templateId: body.templateId,
      groupId: body.groupId,
      anchorDate: body.anchorDate
    })
  });
}
