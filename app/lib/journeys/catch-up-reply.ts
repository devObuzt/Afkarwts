import { getDb } from "../db";
import { acceptCatchUp, catchUpState, declineCatchUp } from "./catch-up";

/**
 * What she pressed on the catch-up offer.
 *
 * Matched on the button's own words, which are fixed in an approved
 * template and cannot drift. Anything else she sends is an ordinary
 * message and is left alone.
 */
const YES = ["يا ريت", "يا ريت 🙏", "نعم", "أكيد"];
const NO = ["ما في داعي", "لا", "مش ضروري"];

export async function answerCatchUpByPress(memberId: number, pressed: string) {
  const text = pressed.trim();
  const said = YES.includes(text) ? "yes" : NO.includes(text) ? "no" : null;
  if (!said) {
    return { handled: false as const };
  }

  // Only an enrolment that was actually offered the catch-up, so a woman
  // who happens to type «نعم» on an unrelated path is not swept up.
  const waiting = getDb()
    .prepare(
      `SELECT e.id FROM journey_enrollments e
         JOIN journey_catchup c ON c.enrollment_id = e.id
        WHERE e.member_id = ? AND c.state = 'offered'`
    )
    .all(memberId) as Array<{ id: number }>;

  for (const row of waiting) {
    if (catchUpState(row.id) !== "offered") {
      continue;
    }
    if (said === "yes") {
      acceptCatchUp(row.id);
    } else {
      declineCatchUp(row.id);
    }
  }

  return { handled: waiting.length > 0, said };
}
