import { getDb } from "../db";
import { getGroup } from "../db";
import { getJourney, getTemplate, listSteps } from "./store";
import { stepDueAt } from "./schedule";

/**
 * Where each woman actually stands — one label each, and they add up to
 * everyone enrolled.
 *
 * The funnel answers «how many got this far», which is the right shape for
 * a chart and the wrong one for a question like «who is not hearing from
 * us». Those overlap, so no row of the funnel is the set of people with a
 * problem. On 2026-10-19 that cost two days: 54 of 252 women were getting
 * nothing and every number on the screen looked healthy.
 *
 * - never_sent       nothing ever left our side for her
 * - not_delivered    we sent, and it never reached her handset
 * - delivered_unread it is on her phone, no read receipt came back
 * - read_silent      she read it and said nothing
 * - replied          she wrote back
 */
export const OUTCOMES = ["never_sent", "not_delivered", "delivered_unread", "read_silent", "replied"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  never_sent: "ما بعتنا إلها ولا رسالة",
  not_delivered: "بعتنا وما وصلها",
  delivered_unread: "وصلها وما انقرأ",
  read_silent: "قرأت وما ردّت",
  replied: "ردّت"
};

export type JourneyFunnel = {
  enrolled: number;
  sent: number;
  reached: number;
  read: number;
  replied: number;
  stopped: Record<string, number>;
  repliedAfterStop: number;
  sms: Record<string, number>;
  manual: Record<string, number>;
  outcomes: Record<Outcome, number>;
};

export type StepRow = {
  stepId: number;
  label: string;
  dueAt: string;
  sentText: number;
  sentTemplate: number;
  failed: number;
  deferred: number;
  missed: number;
  skipped: number;
  stuck: number;
  notSent: number;
  delivered: number;
  read: number;
  replied: number;
};

function countMembers(sql: string, params: unknown[]) {
  const row = getDb().prepare(sql).get(...(params as never[])) as { n: number };
  return row?.n ?? 0;
}

function countBy(sql: string, params: unknown[]) {
  const rows = getDb().prepare(sql).all(...(params as never[])) as Array<{ key: string | null; n: number }>;
  const out: Record<string, number> = {};
  for (const row of rows) {
    if (row.key) {
      out[row.key] = row.n;
    }
  }
  return out;
}


/**
 * The one label per enrollment, in SQL, so the counts and the lists can
 * never disagree — each is this same expression.
 */
const OUTCOME_SQL = `CASE
  WHEN NOT EXISTS (SELECT 1 FROM journey_sends s WHERE s.enrollment_id = e.id AND s.state = 'sent')
    THEN 'never_sent'
  WHEN EXISTS (
    SELECT 1 FROM journey_sends s
      JOIN messages i ON i.member_id = e.member_id AND i.direction = 'incoming' AND i.created_at >= s.attempted_at
     WHERE s.enrollment_id = e.id AND s.state = 'sent'
  ) THEN 'replied'
  WHEN EXISTS (
    SELECT 1 FROM journey_sends s JOIN messages m ON m.id = s.message_id
     WHERE s.enrollment_id = e.id AND m.status = 'read'
  ) THEN 'read_silent'
  WHEN EXISTS (
    SELECT 1 FROM journey_sends s JOIN messages m ON m.id = s.message_id
     WHERE s.enrollment_id = e.id AND m.status IN ('delivered', 'read')
  ) THEN 'delivered_unread'
  ELSE 'not_delivered'
END`;

/** Everyone enrolled, split so the five numbers add up to the whole cohort. */
export function outcomeCounts(journeyId: number): Record<Outcome, number> {
  const rows = getDb()
    .prepare(
      `SELECT ${OUTCOME_SQL} AS key, COUNT(*) AS n
         FROM journey_enrollments e WHERE e.journey_id = ? GROUP BY key`
    )
    .all(journeyId) as Array<{ key: Outcome; n: number }>;

  const out = Object.fromEntries(OUTCOMES.map((name) => [name, 0])) as Record<Outcome, number>;
  for (const row of rows) {
    out[row.key] = row.n;
  }
  return out;
}

/** Every row counts a member once, by their best outcome - never once per message. */
export function journeyFunnel(journeyId: number): JourneyFunnel {
  const enrolled = countMembers("SELECT COUNT(*) AS n FROM journey_enrollments WHERE journey_id = ?", [journeyId]);

  const sent = countMembers(
    `SELECT COUNT(DISTINCT e.id) AS n FROM journey_enrollments e
     JOIN journey_sends s ON s.enrollment_id = e.id AND s.state = 'sent'
     WHERE e.journey_id = ?`,
    [journeyId]
  );

  const reached = countMembers(
    `SELECT COUNT(DISTINCT e.id) AS n FROM journey_enrollments e
     JOIN journey_sends s ON s.enrollment_id = e.id
     JOIN messages m ON m.id = s.message_id
     WHERE e.journey_id = ? AND m.status IN ('delivered', 'read')`,
    [journeyId]
  );

  const read = countMembers(
    `SELECT COUNT(DISTINCT e.id) AS n FROM journey_enrollments e
     JOIN journey_sends s ON s.enrollment_id = e.id
     JOIN messages m ON m.id = s.message_id
     WHERE e.journey_id = ? AND m.status = 'read'`,
    [journeyId]
  );

  // Replied means an incoming message after this journey's first send to them.
  const replied = countMembers(
    `SELECT COUNT(DISTINCT e.id) AS n FROM journey_enrollments e
     JOIN (
       SELECT enrollment_id, MIN(attempted_at) AS first_at
       FROM journey_sends WHERE state = 'sent' GROUP BY enrollment_id
     ) f ON f.enrollment_id = e.id
     JOIN messages i ON i.member_id = e.member_id AND i.direction = 'incoming' AND i.created_at >= f.first_at
     WHERE e.journey_id = ?`,
    [journeyId]
  );

  const repliedAfterStop = countMembers(
    `SELECT COUNT(DISTINCT e.id) AS n FROM journey_enrollments e
     JOIN messages i ON i.member_id = e.member_id AND i.direction = 'incoming' AND i.created_at >= e.stopped_at
     WHERE e.journey_id = ? AND e.state = 'stopped'`,
    [journeyId]
  );

  const stopped = countBy(
    `SELECT stop_reason AS key, COUNT(*) AS n FROM journey_enrollments
     WHERE journey_id = ? AND state = 'stopped' GROUP BY stop_reason`,
    [journeyId]
  );

  const followupCounts = (kind: "sms" | "manual") =>
    countBy(
      `SELECT f.state AS key, COUNT(*) AS n FROM followups f
       JOIN journey_enrollments e ON e.id = f.enrollment_id
       WHERE e.journey_id = ? AND f.kind = ? GROUP BY f.state`,
      [journeyId, kind]
    );

  return {
    enrolled,
    sent,
    reached,
    read,
    replied,
    stopped,
    repliedAfterStop,
    sms: followupCounts("sms"),
    manual: followupCounts("manual"),
    outcomes: outcomeCounts(journeyId)
  };
}

/** Which message lost the cohort: one row per step, in schedule order. */
export function stepBreakdown(journeyId: number): StepRow[] {
  const journey = getJourney(journeyId);
  if (!journey) {
    return [];
  }

  const db = getDb();
  // Ordered by when each step actually fires, not by its weekday number: a
  // cohort that starts on a Tuesday reaches Thursday before it reaches Sunday.
  return listSteps(journey.templateId)
    .map((step) => {
      const counts = countBy(
        `SELECT s.state AS key, COUNT(*) AS n FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
         WHERE e.journey_id = ? AND s.step_id = ? GROUP BY s.state`,
        [journeyId, step.id]
      );

      const channels = countBy(
        `SELECT s.channel AS key, COUNT(*) AS n FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
         WHERE e.journey_id = ? AND s.step_id = ? AND s.state = 'sent' GROUP BY s.channel`,
        [journeyId, step.id]
      );

      const statuses = countBy(
        `SELECT m.status AS key, COUNT(*) AS n FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
         JOIN messages m ON m.id = s.message_id
         WHERE e.journey_id = ? AND s.step_id = ? GROUP BY m.status`,
        [journeyId, step.id]
      );

      // A reply within 48 hours of this step's own send.
      const replied = (
        db
          .prepare(
            `SELECT COUNT(DISTINCT e.id) AS n FROM journey_sends s
             JOIN journey_enrollments e ON e.id = s.enrollment_id
             JOIN messages i ON i.member_id = e.member_id AND i.direction = 'incoming'
               AND i.created_at >= s.attempted_at
               AND julianday(i.created_at) - julianday(s.attempted_at) <= 2
             WHERE e.journey_id = ? AND s.step_id = ? AND s.state = 'sent'`
          )
          .get(journeyId, step.id) as { n: number }
      ).n;

      // A send Meta accepted and then rejected is a failure too, and the
      // rejection arrives long after the send. Counting only the send's own
      // state would report a clean step while a message sat failed.
      const failed = (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM journey_sends s
             JOIN journey_enrollments e ON e.id = s.enrollment_id
             LEFT JOIN messages m ON m.id = s.message_id
             WHERE e.journey_id = ? AND s.step_id = ? AND (s.state = 'failed' OR m.status = 'failed')`
          )
          .get(journeyId, step.id) as { n: number }
      ).n;

      // Every enrolled woman this step has no row for at all. This is the
      // one number that was missing: on 2026-10-19 the Clean 18/10 report
      // read «failed 0 · missed 0 · skipped 0 · stuck 0» on every step
      // while fifty-four of its 252 women were getting nothing, because
      // a woman the runner never reached leaves no row to count.
      const notSent = (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM journey_enrollments e
              WHERE e.journey_id = ?
                AND NOT EXISTS (SELECT 1 FROM journey_sends s
                                 WHERE s.enrollment_id = e.id AND s.step_id = ?)`
          )
          .get(journeyId, step.id) as { n: number }
      ).n;

      // A row still pending long after it was claimed means a process died
      // between claiming a step and recording it. It is never resent.
      const stuck = (
        db
          .prepare(
            `SELECT COUNT(*) AS n FROM journey_sends s
             JOIN journey_enrollments e ON e.id = s.enrollment_id
             WHERE e.journey_id = ? AND s.step_id = ? AND s.state = 'pending'
               AND julianday('now') - julianday(s.attempted_at) > 10.0 / (24 * 60)`
          )
          .get(journeyId, step.id) as { n: number }
      ).n;

      const dueAt = stepDueAt(journey.anchorDate, step);

      return {
        stepId: step.id,
        label: step.label || `أسبوع ${step.week}`,
        dueAt: dueAt.toISOString(),
        sentText: channels.text ?? 0,
        sentTemplate: channels.template ?? 0,
        failed,
        deferred: counts.deferred ?? 0,
        missed: counts.missed ?? 0,
        skipped: counts.skipped ?? 0,
        stuck,
        // A step whose hour has not come has reached nobody yet, and
        // «252 لم تُرسل» on tomorrow's row is noise, not a warning.
        notSent: dueAt.getTime() > Date.now() ? 0 : notSent,
        delivered: (statuses.delivered ?? 0) + (statuses.read ?? 0),
        read: statuses.read ?? 0,
        replied
      };
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * The women behind one number on the report.
 *
 * Every count on that screen is a question — who did not get it, who read
 * it, who wrote back — and a number nobody can open is a number nobody can
 * act on. The eight that failed today are eight phone numbers to correct,
 * and they were only reachable by reading the database by hand.
 */
export type WhoRow = { memberId: number; name: string; phone: string; detail: string };

export function whoOnStep(
  journeyId: number,
  stepId: number | null,
  bucket: string,
  view: { onlyAssignedTo?: number | null; withReplyText?: boolean } = {}
): WhoRow[] {
  const db = getDb();
  const onStep = stepId === null ? "" : "AND s.step_id = @stepId";
  // The same rule the people list follows: without «people.all» a coach
  // sees the women assigned to her and nobody else.
  const mine = view.onlyAssignedTo ? "AND mem.assigned_user_id = @assigned" : "";
  // Only the names the statement actually mentions: node:sqlite throws on
  // a named parameter the SQL does not use, and both of these come and go
  // with the view — which is how this returned 500 with an empty body.
  const args: Record<string, number> = { journeyId, limit: 500 };
  if (stepId !== null) {
    args.stepId = stepId;
  }
  if (view.onlyAssignedTo) {
    args.assigned = view.onlyAssignedTo;
  }

  // Each bucket is defined exactly as the count beside it is, so the list
  // and the number can never disagree.
  const where: Record<string, string> = {
    // Meta refused it, or accepted and then rejected it.
    failed: `(s.state = 'failed' OR m.status = 'failed')`,
    sent: `s.state = 'sent'`,
    delivered: `m.status IN ('delivered', 'read')`,
    read: `m.status = 'read'`,
    skipped: `s.state = 'skipped'`,
    stuck: `s.state = 'sent' AND m.status = 'pending'`
  };

  // One of the five outcomes, by the same expression that counted it.
  // Prefixed, because «replied» is also a per-step bucket with its own
  // 48-hour window and a different list behind the same word.
  const outcome = bucket.startsWith("outcome:") ? bucket.slice("outcome:".length) : "";
  if ((OUTCOMES as readonly string[]).includes(outcome)) {
    return db
      .prepare(
        `SELECT mem.id AS memberId, mem.name, mem.phone,
                COALESCE(e.stop_reason, e.state) AS detail
           FROM journey_enrollments e
           JOIN members mem ON mem.id = e.member_id
          WHERE e.journey_id = @journeyId ${mine} AND ${OUTCOME_SQL} = '${outcome}'
          ORDER BY mem.name LIMIT @limit`
      )
      .all(args) as WhoRow[];
  }

  // The women this step has no row for — the ones every other bucket is
  // blind to, because each of them reads a row that was never written.
  if (bucket === "not_sent" && stepId !== null) {
    return db
      .prepare(
        `SELECT mem.id AS memberId, mem.name, mem.phone,
                COALESCE(e.stop_reason, e.state) AS detail
           FROM journey_enrollments e
           JOIN members mem ON mem.id = e.member_id
          WHERE e.journey_id = @journeyId ${mine}
            AND NOT EXISTS (SELECT 1 FROM journey_sends s
                             WHERE s.enrollment_id = e.id AND s.step_id = @stepId)
          ORDER BY mem.name LIMIT @limit`
      )
      .all(args) as WhoRow[];
  }

  if (bucket === "replied") {
    return db
      .prepare(
        `SELECT DISTINCT mem.id AS memberId, mem.name, mem.phone,
                ${
                  // Her words only for somebody who may read the inbox.
                  view.withReplyText
                    ? `COALESCE((SELECT i2.body FROM messages i2
                                  WHERE i2.member_id = mem.id AND i2.direction = 'incoming'
                                    AND i2.created_at >= s.attempted_at
                                  ORDER BY i2.id DESC LIMIT 1), '')`
                    : `'ردّت'`
                } AS detail
           FROM journey_sends s
           JOIN journey_enrollments e ON e.id = s.enrollment_id
           JOIN members mem ON mem.id = e.member_id
           JOIN messages i ON i.member_id = e.member_id AND i.direction = 'incoming'
             AND i.created_at >= s.attempted_at
             AND julianday(i.created_at) - julianday(s.attempted_at) <= 2
          WHERE e.journey_id = @journeyId ${onStep} ${mine} AND s.state = 'sent'
          ORDER BY mem.name LIMIT @limit`
      )
      .all(args) as WhoRow[];
  }

  if (bucket === "enrolled") {
    return db
      .prepare(
        `SELECT mem.id AS memberId, mem.name, mem.phone, e.state AS detail
           FROM journey_enrollments e
           JOIN members mem ON mem.id = e.member_id
          WHERE e.journey_id = @journeyId ${mine}
          ORDER BY mem.name LIMIT @limit`
      )
      // «enrolled» is the one bucket that knows nothing about a step, so
      // it is the one that must not be handed @stepId.
      .all({ journeyId, limit: 500, ...(view.onlyAssignedTo ? { assigned: view.onlyAssignedTo } : {}) }) as WhoRow[];
  }

  const clause = where[bucket];
  if (!clause) {
    return [];
  }

  return db
    .prepare(
      `SELECT DISTINCT mem.id AS memberId, mem.name, mem.phone,
              COALESCE(m.error, m.status, s.state) AS detail
         FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
         JOIN members mem ON mem.id = e.member_id
         LEFT JOIN messages m ON m.id = s.message_id
        WHERE e.journey_id = @journeyId ${onStep} ${mine} AND ${clause}
        ORDER BY mem.name LIMIT @limit`
    )
    .all(args) as WhoRow[];
}

export function journeyLabel(journeyId: number) {
  const journey = getJourney(journeyId);
  if (!journey) {
    return { name: `#${journeyId}`, group: "" };
  }
  return {
    name: getTemplate(journey.templateId)?.name ?? `#${journey.templateId}`,
    group: getGroup(journey.groupId)?.name ?? `#${journey.groupId}`
  };
}

export function formatTickReport(input: {
  journeyName: string;
  groupName: string;
  sent: number;
  sentText: number;
  sentTemplate: number;
  failed: number;
  deferred: number;
  stopped: number;
}) {
  return [
    `📤 مسار «${input.journeyName}» · ${input.groupName}`,
    `انبعت: ${input.sent} (${input.sentText} نص حر · ${input.sentTemplate} قالب)`,
    input.failed || input.deferred ? `فشل: ${input.failed} · مؤجل: ${input.deferred}` : null,
    input.stopped ? `وقفوا: ${input.stopped}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatDailyDigest(journeyId: number) {
  const funnel = journeyFunnel(journeyId);
  const { name, group } = journeyLabel(journeyId);
  const stopped = Object.entries(funnel.stopped);

  return [
    `📊 مسار «${name}» · ${group}`,
    `مسجّلين: ${funnel.enrolled} · وصلت: ${funnel.reached} · انقرأت: ${funnel.read} · ردّوا: ${funnel.replied}`,
    stopped.length
      ? `وقفوا: ${stopped.reduce((sum, [, n]) => sum + n, 0)} (${stopped
          .map(([reason, n]) => `${reason}: ${n}`)
          .join(" · ")})`
      : "وقفوا: 0",
    `SMS: ${funnel.sms.sent ?? 0} انبعتت · ${funnel.sms.queued ?? 0} بالطابور · ${funnel.sms.failed ?? 0} فشلت`,
    `مهام يدوية مفتوحة: ${funnel.manual.open ?? 0}`,
    funnel.repliedAfterStop ? `ردّوا بعد الوقف: ${funnel.repliedAfterStop}` : null
  ]
    .filter(Boolean)
    .join("\n");
}
