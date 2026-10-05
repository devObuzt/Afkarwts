import { getDb } from "./db";
import { stepDueAt } from "./journeys/schedule";

/**
 * What the screen opens on.
 *
 * The old inbox opens on a list of conversations and leaves the reading to
 * Afkar: she scrolls to find who replied, opens Journeys to see who stopped,
 * then Leads to see who registered. This answers the one question she
 * actually has — what needs me today — and everything else is a link away.
 */

export type DecisionItem = {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  /** `now` is something that stops a path; `soon` is something to catch up on. */
  weight: "now" | "soon";
};

export type RunningPath = {
  journeyId: number;
  pathName: string;
  groupName: string;
  anchorDate: string;
  status: string;
  members: number;
  stepsTotal: number;
  stepsSent: number;
  nextLabel: string;
  nextAt: string | null;
};

export type WaitingReply = {
  memberId: number;
  name: string;
  phone: string;
  body: string;
  at: string;
};

export type Today = {
  decisions: DecisionItem[];
  paths: RunningPath[];
  replies: WaitingReply[];
};

function toIso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function plural(count: number, one: string, few: string) {
  return count === 1 ? one : `${count} ${few}`;
}

export function getToday(now = new Date()): Today {
  const db = getDb();
  const decisions: DecisionItem[] = [];

  // Registrations waiting to be let into a item.
  const pending = db
    .prepare(
      `SELECT f.id AS form_id, f.name AS form_name, COUNT(*) AS waiting
         FROM form_submissions s
         JOIN forms f ON f.id = s.form_id
        WHERE s.state = 'new'
        GROUP BY f.id
        ORDER BY waiting DESC`
    )
    .all() as Array<{ form_id: number; form_name: string; waiting: number }>;

  for (const row of pending) {
    decisions.push({
      key: `form-${row.form_id}`,
      title: `${plural(Number(row.waiting), "تسجيل جديد", "تسجيلات جديدة")} على «${row.form_name}»`,
      detail: "بانتظار المراجعة قبل الإضافة إلى المجموعة",
      href: `/new/paths?form=${row.form_id}`,
      action: "مراجعة",
      weight: "now"
    });
  }

  // Tasks the system opened because a message could not be delivered.
  const tasks = db
    .prepare(
      `SELECT f.id, f.reason, f.kind, m.id AS member_id, m.name, m.phone
         FROM followups f
         JOIN members m ON m.id = f.member_id
        WHERE f.state IN ('open', 'failed')
        ORDER BY f.id DESC
        LIMIT 20`
    )
    .all() as Array<Record<string, string | number>>;

  for (const task of tasks) {
    decisions.push({
      key: `task-${task.id}`,
      title: String(task.name),
      detail: String(task.reason) || (task.kind === "sms" ? "الـSMS البديل فشل" : "تحتاج تواصلاً يدوياً"),
      href: `/new/people/${Number(task.member_id)}`,
      action: "فتح الملف",
      weight: "now"
    });
  }

  // People a live path stopped writing to, because nothing was being read.
  const stopped = db
    .prepare(
      `SELECT j.id AS journey_id, g.name AS group_name, COUNT(*) AS stopped
         FROM journey_enrollments e
         JOIN journeys j ON j.id = e.journey_id
         LEFT JOIN groups g ON g.id = j.group_id
        WHERE e.state = 'stopped' AND j.status = 'active'
        GROUP BY j.id`
    )
    .all() as Array<{ journey_id: number; group_name: string; stopped: number }>;

  for (const row of stopped) {
    decisions.push({
      key: `stopped-${row.journey_id}`,
      title: `${plural(Number(row.stopped), "وحدة متوقف", "وقفوا")} عن «${row.group_name}»`,
      detail: "لم تُقرأ أي رسالة — يمكن إعادتهم إلى المسار أو تركهم",
      href: `/new/paths/${row.journey_id}`,
      action: "عرض",
      weight: "soon"
    });
  }

  const pathRows = db
    .prepare(
      `SELECT j.id, j.anchor_date, j.status, t.id AS template_id, t.name AS path_name, g.name AS group_name,
              (SELECT COUNT(*) FROM journey_enrollments e WHERE e.journey_id = j.id AND e.state = 'active') AS members,
              (SELECT COUNT(*) FROM journey_sends s
                 JOIN journey_enrollments e ON e.id = s.enrollment_id
                WHERE e.journey_id = j.id AND s.state = 'sent') AS sent
         FROM journeys j
         LEFT JOIN journey_templates t ON t.id = j.template_id
         LEFT JOIN groups g ON g.id = j.group_id
        WHERE j.status IN ('active', 'paused')
        ORDER BY j.anchor_date DESC`
    )
    .all() as Array<Record<string, string | number>>;

  const steps = db.prepare(
    "SELECT week, weekday, send_time, label FROM journey_steps WHERE template_id = ? AND archived_at IS NULL ORDER BY week, weekday, send_time"
  );

  const paths: RunningPath[] = pathRows.map((row) => {
    const anchorDate = String(row.anchor_date);
    const stepRows = steps.all(Number(row.template_id)) as Array<Record<string, string | number>>;

    const upcoming = stepRows
      .map((step) => ({
        label: String(step.label),
        at: stepDueAt(anchorDate, {
          week: Number(step.week),
          weekday: Number(step.weekday),
          sendTime: String(step.send_time)
        })
      }))
      .filter((step) => step.at.getTime() > now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    const members = Number(row.members);
    return {
      journeyId: Number(row.id),
      pathName: String(row.path_name ?? ""),
      groupName: String(row.group_name ?? ""),
      anchorDate,
      status: String(row.status),
      members,
      stepsTotal: stepRows.length * Math.max(members, 1),
      stepsSent: Number(row.sent),
      // A step's label is ours, for the schedule screen, and some were left
      // blank — «الجاي: 18:45 — «»» says nothing at all.
      nextLabel: upcoming[0] ? upcoming[0].label || "الخطوة التالية" : "انتهت الخطوات",
      nextAt: upcoming[0]?.at.toISOString() ?? null
    };
  });

  // Whoever wrote last and has not been answered since.
  const replies = (
    db
      .prepare(
        `SELECT m.id AS member_id, m.name, m.phone, last.body, last.created_at
           FROM members m
           JOIN messages last ON last.id = (SELECT id FROM messages WHERE member_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1)
          WHERE last.direction = 'incoming'
          ORDER BY last.created_at DESC
          LIMIT 12`
      )
      .all() as Array<Record<string, string | number>>
  ).map((row) => ({
    memberId: Number(row.member_id),
    name: String(row.name),
    phone: String(row.phone),
    body: String(row.body),
    at: toIso(String(row.created_at))
  }));

  return { decisions, paths, replies };
}
