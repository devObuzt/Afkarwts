import { getDb } from "../db";
import { getGroup } from "../db";
import { getJourney, getTemplate, listSteps } from "./store";
import { stepDueAt } from "./schedule";

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
    manual: followupCounts("manual")
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

      return {
        stepId: step.id,
        label: step.label || `أسبوع ${step.week}`,
        dueAt: stepDueAt(journey.anchorDate, step).toISOString(),
        sentText: channels.text ?? 0,
        sentTemplate: channels.template ?? 0,
        failed,
        deferred: counts.deferred ?? 0,
        missed: counts.missed ?? 0,
        skipped: counts.skipped ?? 0,
        stuck,
        delivered: (statuses.delivered ?? 0) + (statuses.read ?? 0),
        read: statuses.read ?? 0,
        replied
      };
    })
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
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
