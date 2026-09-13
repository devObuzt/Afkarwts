import { NextResponse } from "next/server";
import { getJourney, setJourneyStatus } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

const ALLOWED = new Set(["draft", "active", "paused", "done"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { status?: string };

  if (!body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json({ error: "حالة غير معروفة." }, { status: 400 });
  }

  setJourneyStatus(id, body.status as "draft" | "active" | "paused" | "done");
  return NextResponse.json({ journey: getJourney(id) });
}
