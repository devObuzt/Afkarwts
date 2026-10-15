import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { getDb } from "@/app/lib/db";

export const runtime = "nodejs";

/**
 * Try a step again for the people it failed for.
 *
 * Clearing the written-off attempt is all it takes: the runner then sees
 * the step as due and sends it the ordinary way, with the step's own
 * template and that member's own values. Rebuilding the message by hand
 * here would be a second, slightly different version of the same send.
 *
 * Only failures, and only for a step whose window is still open — a step
 * whose hour has long passed is not resent at midnight.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const journeyId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as { stepId?: number; memberIds?: number[] };
  const stepId = Number(body.stepId);
  if (!Number.isInteger(stepId)) {
    return NextResponse.json({ error: "أي خطوة؟" }, { status: 400 });
  }

  const db = getDb();
  const chosen = (body.memberIds ?? []).map(Number).filter(Number.isInteger);

  const rows = db
    .prepare(
      `SELECT s.id, e.member_id FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
        WHERE e.journey_id = ? AND s.step_id = ? AND s.state = 'failed'`
    )
    .all(journeyId, stepId) as Array<{ id: number; member_id: number }>;

  // An empty list means everyone who failed on this step.
  const target = chosen.length ? rows.filter((row) => chosen.includes(row.member_id)) : rows;

  for (const row of target) {
    db.prepare("DELETE FROM journey_sends WHERE id = ?").run(row.id);
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "journey.status",
    subjectType: "journey",
    subjectId: journeyId,
    subjectLabel: `خطوة ${stepId}`,
    detail: `إعادة إرسال لـ${target.length}`
  });

  return NextResponse.json({ reopened: target.length });
}
