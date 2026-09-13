import { NextResponse } from "next/server";
import { journeyFunnel, journeyLabel, stepBreakdown } from "@/app/lib/journeys/report";
import { getJourney } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const journey = getJourney(id);

  if (!journey) {
    return NextResponse.json({ error: "المسار غير موجود." }, { status: 404 });
  }

  return NextResponse.json({
    journey: { ...journey, ...journeyLabel(id) },
    funnel: journeyFunnel(id),
    steps: stepBreakdown(id)
  });
}
