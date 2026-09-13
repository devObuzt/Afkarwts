import { getDb, getMember } from "../db";
import { sendSms } from "../sms";
import { isIsraeliMobile } from "../sms-format";
import { alternateCountryCode } from "../whatsapp-errors";
import { jerusalemHour } from "./schedule";
import { resumeEnrollment } from "./store";

export type Followup = {
  id: number;
  memberId: number;
  enrollmentId: number | null;
  kind: "sms" | "manual";
  reason: string;
  state: "queued" | "sent" | "failed" | "open" | "done";
  body: string;
  providerRef: string | null;
  attempts: number;
  error: string | null;
  note: string;
  createdAt: string;
  resolvedAt: string | null;
};

type DbFollowup = {
  id: number;
  member_id: number;
  enrollment_id: number | null;
  kind: Followup["kind"];
  reason: string;
  state: Followup["state"];
  body: string;
  provider_ref: string | null;
  attempts: number;
  error: string | null;
  note: string;
  created_at: string;
  resolved_at: string | null;
};

const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 20;
const MAX_ATTEMPTS = 3;

const REASON_TEXT: Record<string, string> = {
  not_delivered: "الرسالة ما وصلت لجهازه خلال يومين",
  not_read: "وصلت وما انقرأت خلال يومين",
  send_failed: "الرقم ما بيستقبل واتساب — أو كود الدولة غلط"
};

function mapFollowup(row: DbFollowup): Followup {
  return {
    id: row.id,
    memberId: row.member_id,
    enrollmentId: row.enrollment_id,
    kind: row.kind,
    reason: row.reason,
    state: row.state,
    body: row.body,
    providerRef: row.provider_ref,
    attempts: row.attempts,
    error: row.error,
    note: row.note,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at
  };
}

/** Every stop opens a task a person can act on, and an SMS only where one can arrive. */
export function openFollowupsForStop(input: {
  enrollmentId: number | null;
  memberId: number;
  reason: string;
  smsText: string;
}) {
  const member = getMember(input.memberId);
  if (!member) {
    return;
  }

  const reachableBySms = isIsraeliMobile(member.phone);
  let reason = REASON_TEXT[input.reason] ?? input.reason;

  if (input.reason === "send_failed") {
    const alternate = alternateCountryCode(member.phone);
    if (alternate) {
      reason += ` · جرّب ${alternate}`;
    }
  }

  if (!reachableBySms) {
    reason += " · رقم مش إسرائيلي — ما بيدخل طابور SMS";
  }

  const db = getDb();
  db.prepare(
    "INSERT INTO followups (member_id, enrollment_id, kind, reason, state) VALUES (?, ?, 'manual', ?, 'open')"
  ).run(input.memberId, input.enrollmentId, reason);

  if (reachableBySms && input.smsText.trim()) {
    db.prepare(
      "INSERT INTO followups (member_id, enrollment_id, kind, reason, state, body) VALUES (?, ?, 'sms', ?, 'queued', ?)"
    ).run(input.memberId, input.enrollmentId, REASON_TEXT[input.reason] ?? input.reason, input.smsText.trim());
  }
}

export function listFollowups(filter: { kind?: Followup["kind"]; state?: string } = {}) {
  const clauses: string[] = [];
  const params: Array<string> = [];

  if (filter.kind) {
    clauses.push("kind = ?");
    params.push(filter.kind);
  }
  if (filter.state) {
    clauses.push("state = ?");
    params.push(filter.state);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`SELECT * FROM followups ${where} ORDER BY created_at ASC, id ASC`)
    .all(...params) as DbFollowup[];
  return rows.map(mapFollowup);
}

/**
 * Queued messages go out during waking hours only. Each row gets one attempt
 * per call and is marked failed, with the provider's reason, after three.
 */
export async function drainSmsQueue(now: Date) {
  const totals = { sent: 0, failed: 0, held: 0 };
  const queued = listFollowups({ kind: "sms", state: "queued" });

  const hour = jerusalemHour(now);
  if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) {
    totals.held = queued.length;
    return totals;
  }

  const db = getDb();
  for (const item of queued) {
    const member = getMember(item.memberId);
    if (!member) {
      db.prepare("UPDATE followups SET state = 'failed', error = ? WHERE id = ?").run("Member not found.", item.id);
      totals.failed += 1;
      continue;
    }

    try {
      const { providerRef } = await sendSms(member.phone, item.body);
      db.prepare(
        "UPDATE followups SET state = 'sent', provider_ref = ?, attempts = attempts + 1, resolved_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(providerRef, item.id);
      totals.sent += 1;
    } catch (error) {
      const text = error instanceof Error ? error.message : "SMS send failed.";
      const attempts = item.attempts + 1;
      const state = attempts >= MAX_ATTEMPTS ? "failed" : "queued";
      db.prepare("UPDATE followups SET state = ?, attempts = ?, error = ? WHERE id = ?").run(
        state,
        attempts,
        text,
        item.id
      );
      if (state === "failed") {
        totals.failed += 1;
      }
    }
  }

  return totals;
}

export function resolveManual(id: number, note: string) {
  getDb()
    .prepare("UPDATE followups SET state = 'done', note = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(note, id);
}

/** After a person got through, the member can carry on from the next step. */
export function resumeFromFollowup(id: number) {
  const row = getDb().prepare("SELECT enrollment_id FROM followups WHERE id = ?").get(id) as
    | { enrollment_id: number | null }
    | undefined;

  if (row?.enrollment_id) {
    resumeEnrollment(row.enrollment_id);
  }
  resolveManual(id, "رجع للمسار");
}
