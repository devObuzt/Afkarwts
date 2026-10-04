import { getDb, getMember, listMessages, type Member, type Message } from "./db";
import { listPersonFiles, type PersonFile } from "./person-files";

/**
 * One person, gathered.
 *
 * Today a contact is a WhatsApp thread, and everything else about them lives
 * on another page: their registration under Leads, their cohort under
 * Journeys, the task to chase them under Follow-up. Nothing answers "who is
 * this person and what has happened with her" — which is the question asked
 * before every message Afkar writes.
 */

export type PersonGroup = { id: number; name: string };

export type PersonJourney = {
  journeyId: number;
  pathName: string;
  groupName: string;
  anchorDate: string;
  status: string;
  state: string;
  stopReason: string | null;
  sent: number;
  read: number;
};

export type PersonSubmission = {
  id: number;
  formName: string;
  submittedAt: string;
  state: string;
  answers: Array<{ label: string; value: string }>;
};

export type PersonTask = {
  id: number;
  kind: string;
  state: string;
  reason: string;
  body: string;
  createdAt: string;
};

export type TimelineEntry = {
  at: string;
  kind: "message" | "reply" | "submission" | "joined" | "stopped" | "task" | "file";
  title: string;
  detail: string;
};

export type PersonRecord = {
  member: Member;
  groups: PersonGroup[];
  journeys: PersonJourney[];
  submissions: PersonSubmission[];
  tasks: PersonTask[];
  messages: Message[];
  files: PersonFile[];
  /** Whether a free-text reply is still allowed, and until when. */
  windowOpen: boolean;
  windowClosesAt: string | null;
  /** False when the reader may not see the medical answers, so the screen can say so. */
  seesHealth: boolean;
  /** The answers that decide a programme, lifted out of the registration. */
  highlights: Array<{ label: string; value: string }>;
  timeline: TimelineEntry[];
};

/** SQLite stamps rows without a zone; they are UTC. */
function toIso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

/**
 * Which registration answers Afkar reads before writing a programme. Matched
 * on the question's wording rather than an id, because the questions are
 * edited per cohort and a form built from a different template still answers
 * the same things.
 */
/** An answer is withheld by the wording of its question, the same test the highlights use. */
function withoutHealth(submission: PersonSubmission): PersonSubmission {
  return {
    ...submission,
    answers: submission.answers.filter((answer) => !HIGHLIGHT_WORDS.some((word) => answer.label.includes(word)))
  };
}

const HIGHLIGHT_WORDS = ["أمراض", "أدوية", "علاج", "حساسية", "حامل", "مرضعة"];

function highlightsFrom(submissions: PersonSubmission[]) {
  const latest = submissions[0];
  if (!latest) {
    return [];
  }

  return latest.answers.filter((answer) => {
    if (!answer.value.trim() || answer.value.startsWith("data:image")) {
      return false;
    }
    // An answer of "no" to "any allergies?" is not worth the space.
    if (answer.value.trim() === "لا" || answer.value.trim() === "لا توجد لدي أمراض") {
      return false;
    }
    return HIGHLIGHT_WORDS.some((word) => answer.label.includes(word));
  });
}

/**
 * WhatsApp allows free text only for 24 hours after the person last wrote.
 * Outside it a send is accepted and then silently dropped, so the screen has
 * to say which one Afkar is looking at before she types.
 */
function replyWindow(messages: Message[]) {
  const lastInbound = [...messages].reverse().find((message) => message.direction === "incoming");

  if (!lastInbound) {
    return { windowOpen: false, windowClosesAt: null };
  }

  const closesAt = new Date(new Date(toIso(lastInbound.createdAt)).getTime() + 24 * 60 * 60 * 1000);
  return { windowOpen: closesAt.getTime() > Date.now(), windowClosesAt: closesAt.toISOString() };
}

/**
 * Reading a person, with or without her medical answers.
 *
 * The health questions are the reason permissions exist here at all, so
 * they are withheld where the record is built — not hidden in the markup,
 * where a view-source or an API call would hand them over anyway.
 */
export function getPersonRecord(
  memberId: number,
  options: { health?: boolean } = { health: true }
): PersonRecord | null {
  const member = getMember(memberId);
  if (!member) {
    return null;
  }

  const db = getDb();

  const groups = db
    .prepare(
      `SELECT groups.id, groups.name FROM member_groups
       JOIN groups ON groups.id = member_groups.group_id
       WHERE member_groups.member_id = ? ORDER BY groups.name`
    )
    .all(memberId) as PersonGroup[];

  const journeyRows = db
    .prepare(
      `SELECT e.id AS enrollment_id, e.journey_id, e.state, e.stop_reason, e.enrolled_at,
              j.anchor_date, j.status, t.name AS path_name, g.name AS group_name,
              (SELECT COUNT(*) FROM journey_sends s WHERE s.enrollment_id = e.id AND s.state = 'sent') AS sent,
              (SELECT COUNT(*) FROM journey_sends s
                 JOIN messages m ON m.id = s.message_id
                WHERE s.enrollment_id = e.id AND m.status = 'read') AS read_count
         FROM journey_enrollments e
         JOIN journeys j ON j.id = e.journey_id
         LEFT JOIN journey_templates t ON t.id = j.template_id
         LEFT JOIN groups g ON g.id = j.group_id
        WHERE e.member_id = ?
        ORDER BY e.enrolled_at DESC`
    )
    .all(memberId) as Array<Record<string, string | number | null>>;

  const journeys: PersonJourney[] = journeyRows.map((row) => ({
    journeyId: Number(row.journey_id),
    pathName: String(row.path_name ?? ""),
    groupName: String(row.group_name ?? ""),
    anchorDate: String(row.anchor_date ?? ""),
    status: String(row.status ?? ""),
    state: String(row.state ?? ""),
    stopReason: row.stop_reason ? String(row.stop_reason) : null,
    sent: Number(row.sent ?? 0),
    read: Number(row.read_count ?? 0)
  }));

  const submissionRows = db
    .prepare(
      `SELECT s.id, s.submitted_at, s.state, f.name AS form_name
         FROM form_submissions s
         LEFT JOIN forms f ON f.id = s.form_id
        WHERE s.member_id = ? OR (s.phone <> '' AND s.phone = ?)
        ORDER BY s.submitted_at DESC`
    )
    .all(memberId, member.phone) as Array<Record<string, string | number | null>>;

  const answersFor = db.prepare("SELECT label, value FROM form_answers WHERE submission_id = ? ORDER BY id");
  const submissions: PersonSubmission[] = submissionRows.map((row) => ({
    id: Number(row.id),
    formName: String(row.form_name ?? ""),
    submittedAt: toIso(String(row.submitted_at)),
    state: String(row.state ?? ""),
    answers: answersFor.all(Number(row.id)) as Array<{ label: string; value: string }>
  }));

  const tasks = (
    db
      .prepare("SELECT id, kind, state, reason, body, created_at FROM followups WHERE member_id = ? ORDER BY id DESC")
      .all(memberId) as Array<Record<string, string | number>>
  ).map((row) => ({
    id: Number(row.id),
    kind: String(row.kind),
    state: String(row.state),
    reason: String(row.reason),
    body: String(row.body),
    createdAt: toIso(String(row.created_at))
  }));

  const messages = listMessages(memberId);
  const files = listPersonFiles(memberId);

  const timeline: TimelineEntry[] = [];

  for (const message of messages) {
    timeline.push({
      at: toIso(message.createdAt),
      kind: message.direction === "incoming" ? "reply" : "message",
      title: message.direction === "incoming" ? "ردّت" : "وصلتها رسالة",
      detail: message.body.slice(0, 160)
    });
  }

  for (const submission of submissions) {
    timeline.push({
      at: submission.submittedAt,
      kind: "submission",
      title: `عبّت استمارة «${submission.formName}»`,
      detail: `${submission.answers.length} جواب`
    });
  }

  for (const row of journeyRows) {
    timeline.push({
      at: toIso(String(row.enrolled_at)),
      kind: "joined",
      title: `دخلت دورة «${String(row.group_name ?? "")}»`,
      detail: String(row.path_name ?? "")
    });
  }

  for (const task of tasks) {
    timeline.push({
      at: task.createdAt,
      kind: "task",
      title: task.kind === "sms" ? "انبعتلها SMS" : "انفتحت مهمة متابعة",
      detail: task.reason
    });
  }

  for (const file of files) {
    timeline.push({
      at: toIso(file.uploadedAt),
      kind: "file",
      title: "انرفع ملف",
      detail: `${file.label} · ${file.sizeLabel}`
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const seesHealth = options.health !== false;

  return {
    member,
    groups,
    journeys,
    submissions: seesHealth ? submissions : submissions.map(withoutHealth),
    tasks,
    messages,
    files,
    ...replyWindow(messages),
    highlights: seesHealth ? highlightsFrom(submissions) : [],
    seesHealth,
    timeline
  };
}

export type PersonSummary = {
  id: number;
  name: string;
  phone: string;
  city: string;
  groups: string[];
  cohort: string;
  files: number;
  unread: number;
  lastAt: string | null;
  lastDirection: "incoming" | "outgoing" | null;
  lastBody: string;
};

export type PeoplePage = {
  people: PersonSummary[];
  total: number;
  /** Whether a registration exists for people the list is showing. */
  registered: number;
};

/**
 * The list grows every cohort, so it is searched and paged rather than
 * scrolled. A phone is matched on its digits alone: Afkar types 0521234567
 * and the row is stored as +972521234567.
 */
export function listPeople(
  filter: { query?: string; groupId?: number | null; limit?: number; offset?: number } = {}
): PeoplePage {
  const db = getDb();
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  const where: string[] = [];
  const args: Array<string | number> = [];

  const query = (filter.query ?? "").trim();
  if (query) {
    // «0521234567» as typed, «+972521234567» as stored: a leading zero is the
    // local prefix the country code replaces, so it is dropped before matching.
    const digits = query.replace(/\D/g, "").replace(/^0+/, "");
    if (digits.length >= 4) {
      where.push("(members.name LIKE ? OR REPLACE(REPLACE(members.phone, '+', ''), '-', '') LIKE ?)");
      args.push(`%${query}%`, `%${digits}%`);
    } else {
      where.push("(members.name LIKE ? OR members.city LIKE ?)");
      args.push(`%${query}%`, `%${query}%`);
    }
  }

  if (filter.groupId) {
    where.push("EXISTS (SELECT 1 FROM member_groups mg WHERE mg.member_id = members.id AND mg.group_id = ?)");
    args.push(filter.groupId);
  }

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM members ${clause}`).get(...args) as { n: number }).n
  );

  const rows = db
    .prepare(
      `SELECT members.id, members.name, members.phone, members.city,
              (SELECT COUNT(*) FROM person_files pf WHERE pf.member_id = members.id) AS files,
              (SELECT COUNT(*) FROM messages msg
                WHERE msg.member_id = members.id AND msg.direction = 'incoming'
                  AND (members.last_read_message_id IS NULL OR msg.id > members.last_read_message_id)) AS unread,
              (SELECT COUNT(*) FROM form_submissions fs
                WHERE fs.member_id = members.id OR (fs.phone <> '' AND fs.phone = members.phone)) AS submissions,
              last.created_at AS last_at, last.direction AS last_direction, last.body AS last_body,
              (SELECT g.name FROM journey_enrollments e
                 JOIN journeys j ON j.id = e.journey_id
                 LEFT JOIN groups g ON g.id = j.group_id
                WHERE e.member_id = members.id AND e.state = 'active' AND j.status = 'active'
                ORDER BY e.id DESC LIMIT 1) AS cohort
         FROM members
         LEFT JOIN messages last
           ON last.id = (SELECT id FROM messages WHERE member_id = members.id ORDER BY created_at DESC, id DESC LIMIT 1)
         ${clause}
         ORDER BY COALESCE(last.created_at, members.created_at) DESC, members.id DESC
         LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as Array<Record<string, string | number | null>>;

  const groupsFor = db.prepare(
    `SELECT groups.name FROM member_groups
      JOIN groups ON groups.id = member_groups.group_id
     WHERE member_groups.member_id = ? ORDER BY groups.name`
  );

  const people: PersonSummary[] = rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    phone: String(row.phone),
    city: String(row.city ?? ""),
    groups: (groupsFor.all(Number(row.id)) as Array<{ name: string }>).map((group) => group.name),
    cohort: row.cohort ? String(row.cohort) : "",
    files: Number(row.files ?? 0),
    unread: Number(row.unread ?? 0),
    lastAt: row.last_at ? toIso(String(row.last_at)) : null,
    lastDirection: (row.last_direction as "incoming" | "outgoing" | null) ?? null,
    lastBody: String(row.last_body ?? "")
  }));

  return {
    people,
    total,
    registered: rows.filter((row) => Number(row.submissions ?? 0) > 0).length
  };
}
