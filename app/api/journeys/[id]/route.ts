import { NextResponse } from "next/server";
import { getJourney, listSteps, setJourneyStatus, syncEnrollments } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

const ALLOWED = new Set(["draft", "active", "paused", "done"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { status?: string };

  if (!body.status || !ALLOWED.has(body.status)) {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }

  const journey = getJourney(id);
  if (!journey) {
    return NextResponse.json({ error: "Journey not found." }, { status: 404 });
  }

  if (body.status === "active") {
    // A path with no steps would sit active forever and send nothing, which
    // looks like a broken journey rather than an unfinished one.
    if (!listSteps(journey.templateId).length) {
      return NextResponse.json(
        { error: "This path has no steps yet. Add at least one step under Paths before starting it." },
        { status: 400 }
      );
    }
  }

  setJourneyStatus(id, body.status as "draft" | "active" | "paused" | "done");

  // Enrol straight away rather than leaving the group empty until the next
  // tick, so activating a journey shows its members immediately.
  if (body.status === "active") {
    syncEnrollments(id, new Date());
  }

  return NextResponse.json({ journey: getJourney(id) });
}
