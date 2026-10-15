import { createMessage, getMember, getDb, updateMessageStatus } from "../db";
import { contactFirstName, sendWhatsAppTemplate } from "../whatsapp";
import { missedOnJoin, reopenMissedStep } from "./store";

/**
 * A woman who joined after the path had already started.
 *
 * One missed message is just sent — she is a day behind, not lost. More
 * than one is offered first, because the alternative is a pile of ten
 * WhatsApp messages arriving at once: that reads as spam to her and to
 * Meta, and the cohort's instructions are day-by-day, so the ones for
 * days that already passed help nobody.
 *
 * Nothing goes out until she says «يا ريت». Her press is also what opens
 * the 24-hour window, which is what makes the catch-up sendable at all.
 */
const OFFER_TEMPLATE = process.env.WHATSAPP_CATCHUP_TEMPLATE || "clean_catchup_offer";
/** Her answer is remembered here, keyed by enrolment. */
export type CatchUpState = "offered" | "accepted" | "declined" | "done";

export function recordCatchUp(enrollmentId: number, state: CatchUpState, now = new Date()) {
  getDb()
    .prepare(
      `INSERT INTO journey_catchup (enrollment_id, state, at)
            VALUES (?, ?, ?)
       ON CONFLICT (enrollment_id) DO UPDATE SET state = excluded.state, at = excluded.at`
    )
    .run(enrollmentId, state, now.toISOString());
}

export function catchUpState(enrollmentId: number): CatchUpState | null {
  const row = getDb()
    .prepare("SELECT state FROM journey_catchup WHERE enrollment_id = ?")
    .get(enrollmentId) as { state: CatchUpState } | undefined;
  return row?.state ?? null;
}

/**
 * Decide what a late joiner gets, and do the part that happens now.
 *
 * One missed step is reopened on the spot — the runner sends it on its
 * next tick, with the step's own template. Several are not touched at
 * all until she answers.
 */
export async function greetLateJoiner(input: {
  enrollmentId: number;
  memberId: number;
  missed: number;
}) {
  if (input.missed === 1) {
    const [only] = missedOnJoin(input.enrollmentId);
    if (only) {
      reopenMissedStep(input.enrollmentId, only.stepId);
    }
    recordCatchUp(input.enrollmentId, "done");
    return { action: "sent-the-one" as const };
  }

  // Asked once. A second offer to somebody who said no, or who has not
  // answered yet, is the pestering this was meant to avoid.
  if (catchUpState(input.enrollmentId)) {
    return { action: "already-handled" as const };
  }

  const member = getMember(input.memberId);
  if (!member) {
    return { action: "no-member" as const };
  }

  const pending = createMessage({
    memberId: member.id,
    direction: "outgoing",
    body: "عرض تعويض الرسائل الفائتة",
    status: "pending"
  });

  try {
    const sent = await sendWhatsAppTemplate(member, {
      name: OFFER_TEMPLATE,
      language: "ar",
      bodyParams: [contactFirstName(member)]
    });
    updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId: sent.messageId });
  } catch (error) {
    updateMessageStatus(pending.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "WhatsApp send failed."
    });
    return { action: "offer-failed" as const };
  }

  recordCatchUp(input.enrollmentId, "offered");
  return { action: "offered" as const };
}

/**
 * She said yes. The missed steps are reopened one at a time, spaced out,
 * so ten of them do not land in the same second — a burst to one number
 * reads as spam to Meta, and the number's quality rating is what sets
 * the whole account's daily ceiling.
 */
export const CATCH_UP_GAP_MS = 60 * 1000;

export function acceptCatchUp(enrollmentId: number, now = new Date()) {
  recordCatchUp(enrollmentId, "accepted", now);
  const missed = missedOnJoin(enrollmentId);
  if (!missed.length) {
    recordCatchUp(enrollmentId, "done", now);
    return { queued: 0 };
  }
  // The oldest first: she reads them in the order they were written.
  reopenMissedStep(enrollmentId, missed[0].stepId);
  return { queued: 1, left: missed.length - 1 };
}

/**
 * Called on every tick: lets the next one through once the gap has
 * passed, until she has them all.
 */
export function releaseNextCatchUp(now = new Date()) {
  const db = getDb();
  const waiting = db
    .prepare("SELECT enrollment_id, at FROM journey_catchup WHERE state = 'accepted'")
    .all() as Array<{ enrollment_id: number; at: string }>;

  let released = 0;
  for (const row of waiting) {
    if (now.getTime() - new Date(row.at).getTime() < CATCH_UP_GAP_MS) {
      continue;
    }
    const missed = missedOnJoin(row.enrollment_id);
    if (!missed.length) {
      recordCatchUp(row.enrollment_id, "done", now);
      continue;
    }
    reopenMissedStep(row.enrollment_id, missed[0].stepId);
    recordCatchUp(row.enrollment_id, "accepted", now);
    released += 1;
  }
  return { released };
}

export function declineCatchUp(enrollmentId: number, now = new Date()) {
  recordCatchUp(enrollmentId, "declined", now);
}
