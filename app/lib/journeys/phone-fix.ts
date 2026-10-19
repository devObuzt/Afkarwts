import { getDb, getMember } from "../db";
import { isIsraeliMobile } from "../sms-format";
import { closeStopTaskAfterReply, queueStepSms } from "./followups";
import { getJourney, getStep, getTemplate, owedBacklog, oweStep, resumeEnrollment, stepSmsBody } from "./store";
import { recordCatchUp } from "./catch-up";

/**
 * What a corrected number means for the paths that gave up on it.
 *
 * Every refusal the old number earned was recorded as a fact and never
 * revisited. Sawar Faour's number was typed «0208254566» on 15.10; the
 * template failed, the path stopped her, and the task read «رقم غير
 * إسرائيلي، لا يدخل طابور الـSMS» — true of that number. Ten minutes
 * later somebody corrected it to 0508254566, a perfectly ordinary Israeli
 * mobile, and nothing went back to look: no SMS, no path, no step. She
 * spent four days reading the coach's own messages while the course ran
 * without her.
 *
 * So a corrected number re-opens exactly the decisions the old one closed:
 * the path she was stopped on, the steps she is owed, and the SMS that was
 * refused because the number could not take one.
 */
export function reviveAfterPhoneFix(memberId: number, now = new Date()) {
  const member = getMember(memberId);
  if (!member) {
    return { resumed: 0, owed: 0, sms: 0 };
  }

  const db = getDb();
  // Only a send failure. Someone stopped by hand, or stopped because the
  // message reached a working number and nothing came back, is a different
  // decision and not this function's to overturn.
  const stopped = db
    .prepare(
      `SELECT e.id, e.journey_id FROM journey_enrollments e
         JOIN journeys j ON j.id = e.journey_id
        WHERE e.member_id = ? AND e.state = 'stopped' AND e.stop_reason = 'send_failed'
          AND j.status = 'active'`
    )
    .all(memberId) as Array<{ id: number; journey_id: number }>;

  let owed = 0;
  let sms = 0;

  for (const enrollment of stopped) {
    resumeEnrollment(enrollment.id);
    closeStopTaskAfterReply(enrollment.id);

    // The oldest gap now; the rest follow one a minute from the ordinary
    // catch-up release, so a backlog never lands as a burst.
    const backlog = owedBacklog(enrollment.id, now);
    if (backlog.length) {
      oweStep(enrollment.id, backlog[0].stepId);
      recordCatchUp(enrollment.id, "accepted", now);
      owed += 1;
    }

    // And the SMS the old number could not take. A step whose WhatsApp
    // failed is the one case where the step's own SMS is the answer — the
    // first time round it was refused for the number, not for the step.
    if (!isIsraeliMobile(member.phone)) {
      continue;
    }

    const failed = db
      .prepare(
        `SELECT s.step_id FROM journey_sends s
           LEFT JOIN messages m ON m.id = s.message_id
          WHERE s.enrollment_id = ? AND (s.state = 'failed' OR m.status = 'failed')`
      )
      .all(enrollment.id) as Array<{ step_id: number }>;

    for (const row of failed) {
      const already = db
        .prepare(
          "SELECT 1 FROM followups WHERE enrollment_id = ? AND step_id = ? AND kind = 'sms'"
        )
        .get(enrollment.id, row.step_id);
      if (already) {
        continue;
      }
      const step = getStep(row.step_id);
      const journey = getJourney(enrollment.journey_id);
      const pathSms = journey ? getTemplate(journey.templateId)?.smsText ?? "" : "";
      const text = step ? stepSmsBody(step) || pathSms : pathSms;
      if (queueStepSms({ enrollmentId: enrollment.id, memberId, stepId: row.step_id, text })) {
        sms += 1;
      }
    }
  }

  return { resumed: stopped.length, owed, sms };
}
