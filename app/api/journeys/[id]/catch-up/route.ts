import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { getDb, getMember } from "@/app/lib/db";
import { owedBacklog, oweStep, resumeEnrollment } from "@/app/lib/journeys/store";
import { closeStopTaskAfterReply } from "@/app/lib/journeys/followups";
import { recordCatchUp } from "@/app/lib/journeys/catch-up";

export const runtime = "nodejs";

/**
 * Give a cohort back the steps it never got.
 *
 * Built for the Clean 18/10 stop: 54 women of 252 had no row at all for
 * six steps, because the path had closed on them before those steps
 * fired. Resuming alone is not enough — the send window drops a step
 * whose hour is long past, which is the right rule for a step that
 * merely slipped and the wrong one for a message somebody decided she
 * should have.
 *
 * Nothing is sent from here. The steps are recorded as owed and released
 * one a minute by the ordinary catch-up, with each step's own template
 * and that member's own values; the runner does the sending. A step she
 * already received is never in the backlog, so this cannot send twice.
 *
 * Dry by default, like every other tool that touches live sending: pass
 * `apply: true` to write.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const journeyId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as { memberIds?: number[]; apply?: boolean };
  const chosen = (body.memberIds ?? []).map(Number).filter(Number.isInteger);
  const apply = body.apply === true;
  const now = new Date();

  const enrollments = getDb()
    .prepare("SELECT id, member_id, state, stop_reason FROM journey_enrollments WHERE journey_id = ? AND state IN ('active', 'stopped')")
    .all(journeyId) as Array<{ id: number; member_id: number; state: string; stop_reason: string | null }>;

  const plan = [];
  for (const row of enrollments) {
    if (chosen.length && !chosen.includes(row.member_id)) {
      continue;
    }
    const owed = owedBacklog(row.id, now);
    if (!owed.length) {
      continue;
    }

    const member = getMember(row.member_id);
    plan.push({
      memberId: row.member_id,
      name: member?.name ?? "",
      phone: member?.phone ?? "",
      was: row.state,
      reason: row.stop_reason,
      steps: owed.map((step) => step.stepId)
    });

    if (!apply) {
      continue;
    }

    if (row.state === "stopped") {
      resumeEnrollment(row.id);
      closeStopTaskAfterReply(row.id);
    }
    // The oldest now and nothing more: the rest follow one a minute from
    // the ordinary catch-up release. Six templates landing on one number in
    // the same second reads as spam to Meta, and that number's quality
    // rating sets the daily ceiling for every client on it.
    oweStep(row.id, owed[0].stepId);
    recordCatchUp(row.id, "accepted", now);
  }

  if (apply) {
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "journey.status",
      subjectType: "journey",
      subjectId: journeyId,
      subjectLabel: `تعويض ${plan.length} مشتركة`,
      detail: `${plan.reduce((sum, row) => sum + row.steps.length, 0)} خطوة`
    });
  }

  return NextResponse.json({
    applied: apply,
    members: plan.length,
    steps: plan.reduce((sum, row) => sum + row.steps.length, 0),
    plan
  });
}
