import { getDb } from "../db";
import { SEND_WINDOW_MS } from "./engine";

/**
 * A step that failed, on a number that has since been corrected, is sent
 * again — to the new number.
 *
 * Three women missed the first Clean message because their number was a
 * digit out. Correcting the number put it right everywhere except in the
 * one place that mattered: the message had already been attempted and
 * written off, and nothing would ever try again.
 *
 * So: a send that failed, whose member's phone is no longer the phone it
 * failed against, becomes due again. The window is not applied here on
 * purpose — the twelve hours are about not sending a morning message at
 * night, and this is not a new message, it is the one she never got.
 */
export function reopenFailedSendsOnNewNumbers(now = new Date()) {
  const db = getDb();

  // A failed send carries the number it was attempted against, through the
  // message row. When the member's number has moved on since, it is worth
  // another attempt — once per correction, which is what comparing the two
  // gives: after the retry the message carries the new number too.
  const stale = db
    .prepare(
      `SELECT s.id AS sendId, s.enrollment_id, m.id AS messageId, mem.phone AS now_phone, m.body
         FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
         JOIN members mem ON mem.id = e.member_id
         JOIN messages m ON m.id = s.message_id
         JOIN journeys j ON j.id = e.journey_id
        WHERE s.state = 'failed'
          AND j.status = 'active'
          AND e.state = 'active'
          AND m.sent_to_phone IS NOT NULL
          AND m.sent_to_phone <> mem.phone`
    )
    .all() as Array<{ sendId: number; enrollment_id: number; messageId: number; now_phone: string }>;

  for (const row of stale) {
    // Clearing the attempt is what makes the runner pick the step up on
    // its next tick: it is due, and nothing has been sent for it.
    db.prepare("DELETE FROM journey_sends WHERE id = ?").run(row.sendId);
  }

  return { reopened: stale.length, at: now.toISOString() };
}

/** Kept so the window constant is not dropped by a future tidy-up. */
export const RETRY_IGNORES_WINDOW_MS = SEND_WINDOW_MS;
