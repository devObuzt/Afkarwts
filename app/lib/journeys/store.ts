import { getDb } from "../db";
import { getMessagingLimit } from "../whatsapp";
import { SEND_WINDOW_MS, type EnrollmentState, type LastSend, type PendingStep } from "./engine";
import { stepDueAt } from "./schedule";

export type JourneyTemplate = {
  id: number;
  name: string;
  smsText: string;
  createdAt: string;
  archivedAt: string | null;
};

export type JourneyStep = {
  id: number;
  templateId: number;
  week: number;
  weekday: number;
  sendTime: string;
  label: string;
  freeText: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  templatePreview: string;
  createdAt: string;
  archivedAt: string | null;
};

export type Journey = {
  id: number;
  templateId: number;
  groupId: number;
  anchorDate: string;
  status: "draft" | "active" | "paused" | "done";
  createdAt: string;
  activatedAt: string | null;
};

type DbTemplate = {
  id: number;
  name: string;
  sms_text: string;
  created_at: string;
  archived_at: string | null;
};

type DbStep = {
  id: number;
  template_id: number;
  week: number;
  weekday: number;
  send_time: string;
  label: string;
  free_text: string;
  template_name: string;
  template_language: string;
  body_params: string;
  template_preview: string;
  created_at: string;
  archived_at: string | null;
};

type DbJourney = {
  id: number;
  template_id: number;
  group_id: number;
  anchor_date: string;
  status: Journey["status"];
  created_at: string;
  activated_at: string | null;
};

function mapTemplate(row: DbTemplate): JourneyTemplate {
  return {
    id: row.id,
    name: row.name,
    smsText: row.sms_text,
    createdAt: row.created_at,
    archivedAt: row.archived_at
  };
}

function mapStep(row: DbStep): JourneyStep {
  return {
    id: row.id,
    templateId: row.template_id,
    week: row.week,
    weekday: row.weekday,
    sendTime: row.send_time,
    label: row.label,
    freeText: row.free_text,
    templateName: row.template_name,
    templateLanguage: row.template_language,
    bodyParams: JSON.parse(row.body_params || "[]") as string[],
    templatePreview: row.template_preview,
    createdAt: row.created_at,
    archivedAt: row.archived_at
  };
}

function mapJourney(row: DbJourney): Journey {
  return {
    id: row.id,
    templateId: row.template_id,
    groupId: row.group_id,
    anchorDate: row.anchor_date,
    status: row.status,
    createdAt: row.created_at,
    activatedAt: row.activated_at
  };
}

/* Templates */

export function createTemplate(input: { name: string; smsText?: string }) {
  const result = getDb()
    .prepare("INSERT INTO journey_templates (name, sms_text) VALUES (?, ?)")
    .run(input.name.trim(), input.smsText ?? "");
  return getTemplate(Number(result.lastInsertRowid))!;
}

export function getTemplate(id: number) {
  const row = getDb().prepare("SELECT * FROM journey_templates WHERE id = ?").get(id) as DbTemplate | undefined;
  return row ? mapTemplate(row) : null;
}

export function listTemplates() {
  const rows = getDb()
    .prepare("SELECT * FROM journey_templates WHERE archived_at IS NULL ORDER BY created_at DESC")
    .all() as DbTemplate[];
  return rows.map(mapTemplate);
}

export function updateTemplate(id: number, input: { name?: string; smsText?: string }) {
  const current = getTemplate(id);
  if (!current) {
    throw new Error("Template not found.");
  }

  getDb()
    .prepare("UPDATE journey_templates SET name = ?, sms_text = ? WHERE id = ?")
    .run(input.name?.trim() ?? current.name, input.smsText ?? current.smsText, id);
  return getTemplate(id)!;
}

export function archiveTemplate(id: number) {
  getDb().prepare("UPDATE journey_templates SET archived_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

/* Steps */

export function createStep(input: {
  templateId: number;
  week: number;
  weekday: number;
  sendTime: string;
  label?: string;
  freeText?: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  templatePreview: string;
}) {
  const result = getDb()
    .prepare(
      `INSERT INTO journey_steps
         (template_id, week, weekday, send_time, label, free_text, template_name, template_language, body_params, template_preview)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.templateId,
      input.week,
      input.weekday,
      input.sendTime,
      input.label ?? "",
      input.freeText ?? "",
      input.templateName,
      input.templateLanguage,
      JSON.stringify(input.bodyParams),
      input.templatePreview
    );
  return getStep(Number(result.lastInsertRowid))!;
}

export function getStep(id: number) {
  const row = getDb().prepare("SELECT * FROM journey_steps WHERE id = ?").get(id) as DbStep | undefined;
  return row ? mapStep(row) : null;
}

/** Schedule order, archived steps excluded. */
export function listSteps(templateId: number) {
  const rows = getDb()
    .prepare(
      `SELECT * FROM journey_steps
       WHERE template_id = ? AND archived_at IS NULL
       ORDER BY week ASC, weekday ASC, send_time ASC, id ASC`
    )
    .all(templateId) as DbStep[];
  return rows.map(mapStep);
}

export function updateStep(
  id: number,
  input: Partial<Omit<JourneyStep, "id" | "templateId" | "createdAt" | "archivedAt">>
) {
  const current = getStep(id);
  if (!current) {
    throw new Error("Step not found.");
  }

  const next = { ...current, ...input };
  getDb()
    .prepare(
      `UPDATE journey_steps
       SET week = ?, weekday = ?, send_time = ?, label = ?, free_text = ?,
           template_name = ?, template_language = ?, body_params = ?, template_preview = ?
       WHERE id = ?`
    )
    .run(
      next.week,
      next.weekday,
      next.sendTime,
      next.label,
      next.freeText,
      next.templateName,
      next.templateLanguage,
      JSON.stringify(next.bodyParams),
      next.templatePreview,
      id
    );

  // An edit that moves a step into the past must not fire it on the spot.
  markEditedStepSkipped(id, new Date());
  return getStep(id)!;
}

/** Steps are archived, never deleted, so a sent message keeps its step. */
export function archiveStep(id: number) {
  getDb().prepare("UPDATE journey_steps SET archived_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}

/* Journeys */

export function createJourney(input: { templateId: number; groupId: number; anchorDate: string }) {
  const result = getDb()
    .prepare("INSERT INTO journeys (template_id, group_id, anchor_date) VALUES (?, ?, ?)")
    .run(input.templateId, input.groupId, input.anchorDate);
  return getJourney(Number(result.lastInsertRowid))!;
}

export function getJourney(id: number) {
  const row = getDb().prepare("SELECT * FROM journeys WHERE id = ?").get(id) as DbJourney | undefined;
  return row ? mapJourney(row) : null;
}

export function listJourneys() {
  const rows = getDb().prepare("SELECT * FROM journeys ORDER BY created_at DESC").all() as DbJourney[];
  return rows.map(mapJourney);
}

export function listActiveJourneys() {
  const rows = getDb()
    .prepare("SELECT * FROM journeys WHERE status = 'active' ORDER BY id ASC")
    .all() as DbJourney[];
  return rows.map(mapJourney);
}

export function setJourneyStatus(id: number, status: Journey["status"]) {
  const activating = status === "active";
  getDb()
    .prepare(
      `UPDATE journeys
       SET status = ?, activated_at = CASE WHEN ? = 1 AND activated_at IS NULL THEN CURRENT_TIMESTAMP ELSE activated_at END
       WHERE id = ?`
    )
    .run(status, activating ? 1 : 0, id);
}

/* Enrollments, sends and the tick state */

/**
 * SQLite writes CURRENT_TIMESTAMP as "YYYY-MM-DD HH:MM:SS" in UTC with no zone
 * marker, which JavaScript would otherwise read as local time.
 */
function toIso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function sqliteStamp(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/** A deferred row is a note that a step waited, not a claim on it. */
const SETTLED_STATES = "('pending', 'sent', 'failed', 'missed', 'skipped')";

export function syncEnrollments(journeyId: number, now: Date) {
  const db = getDb();
  const journey = getJourney(journeyId);
  if (!journey) {
    return { added: 0, removed: 0 };
  }

  const steps = listSteps(journey.templateId);
  const memberIds = (
    db.prepare("SELECT member_id FROM member_groups WHERE group_id = ?").all(journey.groupId) as Array<{
      member_id: number;
    }>
  ).map((row) => row.member_id);

  const enrolled = new Map(
    (
      db.prepare("SELECT id, member_id, state FROM journey_enrollments WHERE journey_id = ?").all(journeyId) as Array<{
        id: number;
        member_id: number;
        state: string;
      }>
    ).map((row) => [row.member_id, row])
  );

  let added = 0;
  for (const memberId of memberIds) {
    if (enrolled.has(memberId)) {
      continue;
    }

    const result = db
      .prepare("INSERT INTO journey_enrollments (journey_id, member_id) VALUES (?, ?)")
      .run(journeyId, memberId);
    const enrollmentId = Number(result.lastInsertRowid);
    added += 1;

    // Steps whose window shut before this member joined were never theirs.
    for (const step of steps) {
      if (now.getTime() >= stepDueAt(journey.anchorDate, step).getTime() + SEND_WINDOW_MS) {
        db.prepare(
          "INSERT INTO journey_sends (enrollment_id, step_id, state, attempted_at) VALUES (?, ?, 'skipped', ?)"
        ).run(enrollmentId, step.id, sqliteStamp(now));
      }
    }
  }

  const inGroup = new Set(memberIds);
  let removed = 0;
  for (const [memberId, row] of enrolled) {
    if (!inGroup.has(memberId) && row.state === "active") {
      db.prepare("UPDATE journey_enrollments SET state = 'removed' WHERE id = ?").run(row.id);
      removed += 1;
    }
  }

  return { added, removed };
}

export function loadTickState(journeyId: number, now: Date): EnrollmentState[] {
  const db = getDb();
  const journey = getJourney(journeyId);
  if (!journey) {
    return [];
  }

  const steps = listSteps(journey.templateId);
  const enrollments = db
    .prepare("SELECT id, member_id FROM journey_enrollments WHERE journey_id = ? AND state = 'active'")
    .all(journeyId) as Array<{ id: number; member_id: number }>;

  return enrollments.map((enrollment) => {
    const incoming = db
      .prepare("SELECT MAX(created_at) AS at FROM messages WHERE member_id = ? AND direction = 'incoming'")
      .get(enrollment.member_id) as { at: string | null };

    const lastSendRow = db
      .prepare(
        `SELECT s.step_id, s.attempted_at, s.state, m.status AS message_status, COALESCE(s.error, m.error) AS error
         FROM journey_sends s
         LEFT JOIN messages m ON m.id = s.message_id
         WHERE s.enrollment_id = ? AND s.state IN ('sent', 'failed')
         ORDER BY s.attempted_at DESC, s.id DESC
         LIMIT 1`
      )
      .get(enrollment.id) as
      | { step_id: number; attempted_at: string; state: "sent" | "failed"; message_status: string | null; error: string | null }
      | undefined;

    const settled = new Set(
      (
        db
          .prepare(`SELECT step_id FROM journey_sends WHERE enrollment_id = ? AND state IN ${SETTLED_STATES}`)
          .all(enrollment.id) as Array<{ step_id: number }>
      ).map((row) => row.step_id)
    );

    const dueSteps: PendingStep[] = [];
    const expiredSteps: PendingStep[] = [];
    let hasUnsentStepsAhead = false;

    for (const step of steps) {
      if (settled.has(step.id)) {
        continue;
      }

      const dueAt = stepDueAt(journey.anchorDate, step);
      const pending: PendingStep = {
        stepId: step.id,
        dueAt: dueAt.toISOString(),
        hasFreeText: step.freeText.trim().length > 0
      };

      if (now.getTime() < dueAt.getTime()) {
        hasUnsentStepsAhead = true;
      } else if (now.getTime() < dueAt.getTime() + SEND_WINDOW_MS) {
        dueSteps.push(pending);
      } else {
        expiredSteps.push(pending);
      }
    }

    const lastSend: LastSend | null = lastSendRow
      ? {
          stepId: lastSendRow.step_id,
          attemptedAt: toIso(lastSendRow.attempted_at),
          state: lastSendRow.state,
          messageStatus: (lastSendRow.message_status as LastSend["messageStatus"]) ?? null,
          error: lastSendRow.error
        }
      : null;

    return {
      enrollmentId: enrollment.id,
      memberId: enrollment.member_id,
      lastIncomingAt: incoming.at ? toIso(incoming.at) : null,
      lastSend,
      dueSteps,
      expiredSteps,
      hasUnsentStepsAhead
    };
  });
}

/**
 * Claims a step before it is sent. The unique key means a second tick cannot
 * take the same step, so a process that dies mid-send leaves a pending row
 * rather than a gap that would be sent twice.
 */
export function claimSend(enrollmentId: number, stepId: number, now: Date) {
  // The tick's own clock is written, not the database's: the silence rule
  // measures from this timestamp, and a simulated run must be able to move it.
  const stamp = sqliteStamp(now);
  const row = getDb()
    .prepare(
      `INSERT INTO journey_sends (enrollment_id, step_id, state, attempted_at) VALUES (?, ?, 'pending', ?)
       ON CONFLICT (enrollment_id, step_id) DO UPDATE SET state = 'pending', attempted_at = excluded.attempted_at
         WHERE journey_sends.state = 'deferred'
       RETURNING id`
    )
    .get(enrollmentId, stepId, stamp) as { id: number } | undefined;

  return row ? row.id : null;
}

export function recordSend(
  sendId: number,
  input: { channel: "text" | "template"; messageId: number | null; state: "sent" | "failed"; error?: string | null }
) {
  getDb()
    .prepare("UPDATE journey_sends SET channel = ?, message_id = ?, state = ?, error = ? WHERE id = ?")
    .run(input.channel, input.messageId, input.state, input.error ?? null, sendId);
}

export function recordSendState(
  enrollmentId: number,
  stepId: number,
  state: "deferred" | "missed" | "skipped",
  now: Date
) {
  getDb()
    .prepare(
      `INSERT INTO journey_sends (enrollment_id, step_id, state, attempted_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (enrollment_id, step_id) DO UPDATE SET state = excluded.state, attempted_at = excluded.attempted_at
         WHERE journey_sends.state = 'deferred'`
    )
    .run(enrollmentId, stepId, state, sqliteStamp(now));
}

export function stopEnrollment(enrollmentId: number, reason: string, now: Date) {
  getDb()
    .prepare("UPDATE journey_enrollments SET state = 'stopped', stop_reason = ?, stopped_at = ? WHERE id = ?")
    .run(reason, sqliteStamp(now), enrollmentId);
}

export function completeEnrollment(enrollmentId: number) {
  getDb().prepare("UPDATE journey_enrollments SET state = 'completed' WHERE id = ?").run(enrollmentId);
}

export function resumeEnrollment(enrollmentId: number) {
  getDb()
    .prepare("UPDATE journey_enrollments SET state = 'active', stop_reason = NULL, stopped_at = NULL WHERE id = ?")
    .run(enrollmentId);
}

export function enrollmentMemberId(enrollmentId: number) {
  const row = getDb().prepare("SELECT member_id FROM journey_enrollments WHERE id = ?").get(enrollmentId) as
    | { member_id: number }
    | undefined;
  return row?.member_id ?? null;
}

/**
 * Meta counts business-initiated conversations per rolling 24h. Counting every
 * member we wrote to is deliberately conservative: it also counts replies sent
 * inside an open window, which do not consume the allowance.
 */
export async function remainingAllowance(now: Date) {
  const limit = await getMessagingLimit();
  const since = sqliteStamp(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const row = getDb()
    .prepare("SELECT COUNT(DISTINCT member_id) AS n FROM messages WHERE direction = 'outgoing' AND created_at >= ?")
    .get(since) as { n: number };

  return Math.max(0, limit.dailyLimit - row.n);
}

/**
 * After a step's time is edited, any active enrollment whose new time is
 * already past records a skipped row, so the edit never fires the step on the
 * spot and never looks like an outage.
 */
export function markEditedStepSkipped(stepId: number, now: Date) {
  const step = getStep(stepId);
  if (!step) {
    return;
  }

  const db = getDb();
  const journeys = db
    .prepare("SELECT id, anchor_date FROM journeys WHERE template_id = ? AND status IN ('active', 'paused')")
    .all(step.templateId) as Array<{ id: number; anchor_date: string }>;

  for (const journey of journeys) {
    if (now.getTime() < stepDueAt(journey.anchor_date, step).getTime() + SEND_WINDOW_MS) {
      continue;
    }

    const enrollments = db
      .prepare("SELECT id FROM journey_enrollments WHERE journey_id = ? AND state = 'active'")
      .all(journey.id) as Array<{ id: number }>;

    for (const enrollment of enrollments) {
      db.prepare(
        `INSERT INTO journey_sends (enrollment_id, step_id, state) VALUES (?, ?, 'skipped')
         ON CONFLICT (enrollment_id, step_id) DO NOTHING`
      ).run(enrollment.id, stepId);
    }
  }
}
