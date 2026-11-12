import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { deleteJourney, getJourney, listSteps, setJourneyStatus, syncEnrollments } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

const ALLOWED = new Set(["draft", "active", "paused", "done"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

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

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "journey.status",
    subjectType: "journey",
    subjectId: id,
    detail: body.status
  });

  // Enrol straight away rather than leaving the group empty until the next
  // tick, so activating a journey shows its members immediately.
  if (body.status === "active") {
    syncEnrollments(id, new Date());
  }

  return NextResponse.json({ journey: getJourney(id) });
}

/**
 * محو مسار ما بعت ولا رسالة.
 *
 * مسار بعت ما بينمحى — `deleteJourney` بترفضه، لأنّ سجلّ مين وصلته
 * الرسالة أهم من ترتيب الشاشة. المسودّة اللي انعملت بالغلط هي الحالة
 * اللي هاد موجود إلها: قاعدة على نفس المجموعة، وكبسة «شغّلي» وحدة
 * بتبعت نفس الرسالة مرة تانية لنفس الناس.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const result = deleteJourney(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "journey.status",
    subjectType: "journey",
    subjectId: id,
    detail: `انمحى المسار (مجموعة ${result.journey.groupId}، بلا أي إرسالية)`
  });

  return NextResponse.json({ ok: true });
}
