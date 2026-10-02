import { randomUUID } from "node:crypto";
import { getDb, normalizeImportPhone } from "../db";
import { CLEAN_INTRO, CLEAN_TEMPLATE, CLEAN_TITLE, type FieldKind, type NewField } from "./clean-template";

export type Form = {
  id: number;
  name: string;
  token: string;
  groupId: number;
  groupName: string;
  status: "open" | "closed";
  title: string;
  intro: string;
  submissionCount: number;
  newCount: number;
  createdAt: string;
};

export type Field = {
  id: number;
  formId: number;
  position: number;
  label: string;
  help: string;
  kind: FieldKind;
  required: boolean;
  options: string[];
  mapsTo: "" | "name" | "phone" | "city";
  /** This question appears only when another one was answered a certain way. */
  showWhenFieldId: number | null;
  showWhenValue: string;
};

export type SubmissionRow = {
  id: number;
  formId: number;
  formName: string;
  state: "new" | "added" | "rejected";
  memberId: number | null;
  name: string;
  phone: string;
  city: string;
  submittedAt: string;
  /** Set when this phone already belongs to a member, so approval can ask first. */
  knownMemberId: number | null;
  knownMemberName: string | null;
};

type DbForm = {
  id: number;
  name: string;
  token: string;
  group_id: number;
  group_name: string | null;
  status: Form["status"];
  title: string;
  intro: string;
  created_at: string;
  submission_count: number;
  new_count: number;
};

type DbField = {
  id: number;
  form_id: number;
  position: number;
  label: string;
  help: string;
  kind: FieldKind;
  required: number;
  options: string;
  map_to: Field["mapsTo"];
  show_when_field_id: number | null;
  show_when_value: string;
};

type DbSubmission = {
  id: number;
  form_id: number;
  form_name: string | null;
  state: SubmissionRow["state"];
  member_id: number | null;
  name: string;
  phone: string;
  city: string;
  submitted_at: string;
  known_member_id: number | null;
  known_member_name: string | null;
};

function mapForm(row: DbForm): Form {
  return {
    id: row.id,
    name: row.name,
    token: row.token,
    groupId: row.group_id,
    groupName: row.group_name ?? "",
    status: row.status,
    title: row.title ?? "",
    intro: row.intro,
    submissionCount: Number(row.submission_count ?? 0),
    newCount: Number(row.new_count ?? 0),
    createdAt: row.created_at
  };
}

function mapField(row: DbField): Field {
  return {
    id: row.id,
    formId: row.form_id,
    position: row.position,
    label: row.label,
    help: row.help,
    kind: row.kind,
    required: Boolean(row.required),
    options: JSON.parse(row.options || "[]") as string[],
    mapsTo: row.map_to,
    showWhenFieldId: row.show_when_field_id ?? null,
    showWhenValue: row.show_when_value ?? ""
  };
}

function mapSubmission(row: DbSubmission): SubmissionRow {
  return {
    id: row.id,
    formId: row.form_id,
    formName: row.form_name ?? "",
    state: row.state,
    memberId: row.member_id,
    name: row.name,
    phone: row.phone,
    city: row.city,
    submittedAt: row.submitted_at,
    knownMemberId: row.known_member_id,
    knownMemberName: row.known_member_name
  };
}

const FORM_SELECT = `
  SELECT forms.*, groups.name AS group_name,
         (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = forms.id) AS submission_count,
         (SELECT COUNT(*) FROM form_submissions s WHERE s.form_id = forms.id AND s.state = 'new') AS new_count
  FROM forms
  LEFT JOIN groups ON groups.id = forms.group_id
`;

/** Short enough to type, long enough that links cannot be guessed. */
function newToken() {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

/**
 * People filling a public form type their number the way they say it —
 * "054-522-7674", "0545227674", "+972 54 522 7674". normalizeImportPhone
 * knows all three (and that 056/059 are Palestinian), but it throws on input
 * it cannot read; here an unreadable number is an answer we refuse politely,
 * not a 500.
 */
function formPhone(raw: string) {
  try {
    return normalizeImportPhone(raw);
  } catch {
    return "";
  }
}

export function createForm(input: {
  name: string;
  groupId: number;
  fromTemplate?: boolean;
  title?: string;
  intro?: string;
}) {
  const name = input.name.trim();
  if (!name) {
    throw new Error("The form needs a name.");
  }

  const result = getDb()
    .prepare("INSERT INTO forms (name, token, group_id, title, intro) VALUES (?, ?, ?, ?, ?)")
    .run(
      name,
      newToken(),
      input.groupId,
      input.title ?? (input.fromTemplate ? CLEAN_TITLE : ""),
      input.intro ?? (input.fromTemplate ? CLEAN_INTRO : "")
    );

  const id = Number(result.lastInsertRowid);

  if (input.fromTemplate) {
    // A template refers to its questions by position, because the ids they
    // will be given do not exist yet. Created in order, then the conditions
    // are rewritten to point at the real ids.
    const created = CLEAN_TEMPLATE.map((field) => addField(id, field));

    CLEAN_TEMPLATE.forEach((field, index) => {
      if (field.showWhenIndex === undefined) {
        return;
      }
      const gate = created[field.showWhenIndex];
      if (!gate) {
        throw new Error(`Template question ${index} points at a question that is not there.`);
      }
      updateField(created[index].id, {
        showWhenFieldId: gate.id,
        showWhenValue: field.showWhenValue ?? ""
      });
    });
  }

  return getForm(id)!;
}

export function getForm(id: number) {
  const row = getDb().prepare(`${FORM_SELECT} WHERE forms.id = ?`).get(id) as DbForm | undefined;
  return row ? mapForm(row) : null;
}

export function getFormByToken(token: string) {
  const row = getDb().prepare(`${FORM_SELECT} WHERE forms.token = ?`).get(token) as DbForm | undefined;
  return row ? mapForm(row) : null;
}

export function listForms(): Form[] {
  const rows = getDb().prepare(`${FORM_SELECT} ORDER BY forms.created_at DESC`).all() as DbForm[];
  return rows.map(mapForm);
}

export function updateForm(id: number, patch: { name?: string; title?: string; intro?: string }) {
  const current = getForm(id);
  if (!current) {
    throw new Error("Form not found.");
  }
  getDb()
    .prepare("UPDATE forms SET name = ?, title = ?, intro = ? WHERE id = ?")
    .run(patch.name?.trim() || current.name, patch.title ?? current.title, patch.intro ?? current.intro, id);
  return getForm(id)!;
}

export function setFormStatus(id: number, status: "open" | "closed") {
  getDb()
    .prepare("UPDATE forms SET status = ?, closed_at = ? WHERE id = ?")
    .run(status, status === "closed" ? new Date().toISOString() : null, id);
}

export function deleteForm(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM form_answers WHERE submission_id IN (SELECT id FROM form_submissions WHERE form_id = ?)").run(id);
  db.prepare("DELETE FROM form_submissions WHERE form_id = ?").run(id);
  db.prepare("DELETE FROM form_fields WHERE form_id = ?").run(id);
  db.prepare("DELETE FROM forms WHERE id = ?").run(id);
}

export function listFields(formId: number): Field[] {
  const rows = getDb()
    .prepare("SELECT * FROM form_fields WHERE form_id = ? AND archived_at IS NULL ORDER BY position, id")
    .all(formId) as DbField[];
  return rows.map(mapField);
}

export function getField(fieldId: number) {
  const row = getDb().prepare("SELECT * FROM form_fields WHERE id = ?").get(fieldId) as DbField | undefined;
  return row ? mapField(row) : null;
}

export function addField(formId: number, field: NewField) {
  const next = getDb()
    .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next FROM form_fields WHERE form_id = ?")
    .get(formId) as { next: number };

  const result = getDb()
    .prepare(
      `INSERT INTO form_fields (form_id, position, label, help, kind, required, options, map_to, show_when_field_id, show_when_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      formId,
      next.next,
      field.label.trim(),
      field.help?.trim() ?? "",
      field.kind,
      field.required ? 1 : 0,
      JSON.stringify(field.options ?? []),
      field.mapsTo ?? "",
      field.showWhenFieldId ?? null,
      field.showWhenValue ?? ""
    );

  return getField(Number(result.lastInsertRowid))!;
}

export function updateField(fieldId: number, patch: Partial<NewField>) {
  const current = getField(fieldId);
  if (!current) {
    throw new Error("Field not found.");
  }

  const next = { ...current, ...patch };
  getDb()
    .prepare(
      `UPDATE form_fields SET label = ?, help = ?, kind = ?, required = ?, options = ?, map_to = ?,
           show_when_field_id = ?, show_when_value = ? WHERE id = ?`
    )
    .run(
      next.label.trim(),
      next.help?.trim() ?? "",
      next.kind,
      next.required ? 1 : 0,
      JSON.stringify(next.options ?? []),
      next.mapsTo ?? "",
      next.showWhenFieldId ?? null,
      next.showWhenValue ?? "",
      fieldId
    );

  return getField(fieldId)!;
}

export function archiveField(fieldId: number) {
  getDb().prepare("UPDATE form_fields SET archived_at = ? WHERE id = ?").run(new Date().toISOString(), fieldId);
}

export function moveField(fieldId: number, direction: "up" | "down") {
  const field = getField(fieldId);
  if (!field) {
    return;
  }

  const siblings = listFields(field.formId);
  const index = siblings.findIndex((item) => item.id === fieldId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= siblings.length) {
    return;
  }

  // Positions can collide after edits, so order is rewritten from the list
  // rather than swapped in place.
  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];

  const update = getDb().prepare("UPDATE form_fields SET position = ? WHERE id = ?");
  reordered.forEach((item, at) => update.run(at + 1, item.id));
}

export function recordSubmission(formId: number, answers: Array<{ fieldId: number; value: string }>) {
  const fields = new Map(listFields(formId).map((field) => [field.id, field]));

  let name = "";
  let phone = "";
  let city = "";

  for (const answer of answers) {
    const field = fields.get(answer.fieldId);
    if (!field) {
      continue;
    }
    if (field.mapsTo === "name") {
      name = answer.value.trim();
    } else if (field.mapsTo === "phone") {
      phone = formPhone(answer.value);
    } else if (field.mapsTo === "city") {
      city = answer.value.trim();
    }
  }

  const result = getDb()
    .prepare("INSERT INTO form_submissions (form_id, name, phone, city) VALUES (?, ?, ?, ?)")
    .run(formId, name, phone, city);

  const submissionId = Number(result.lastInsertRowid);
  const insert = getDb().prepare(
    "INSERT INTO form_answers (submission_id, field_id, label, value) VALUES (?, ?, ?, ?)"
  );

  for (const answer of answers) {
    const field = fields.get(answer.fieldId);
    if (!field) {
      continue;
    }
    insert.run(submissionId, field.id, field.label, answer.value);
  }

  return submissionId;
}

const SUBMISSION_SELECT = `
  SELECT form_submissions.*, forms.name AS form_name,
         members.id AS known_member_id, members.name AS known_member_name
  FROM form_submissions
  LEFT JOIN forms ON forms.id = form_submissions.form_id
  LEFT JOIN members ON members.phone = form_submissions.phone AND form_submissions.phone <> ''
`;

export function listSubmissions(filter: { formId?: number; state?: string } = {}): SubmissionRow[] {
  const clauses: string[] = [];
  const params: Array<number | string> = [];

  if (filter.formId) {
    clauses.push("form_submissions.form_id = ?");
    params.push(filter.formId);
  }
  if (filter.state) {
    clauses.push("form_submissions.state = ?");
    params.push(filter.state);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = getDb()
    .prepare(`${SUBMISSION_SELECT} ${where} ORDER BY form_submissions.submitted_at DESC, form_submissions.id DESC`)
    .all(...params) as DbSubmission[];
  return rows.map(mapSubmission);
}

export function getSubmission(id: number) {
  const row = getDb().prepare(`${SUBMISSION_SELECT} WHERE form_submissions.id = ?`).get(id) as
    | DbSubmission
    | undefined;
  if (!row) {
    return null;
  }

  const answers = getDb()
    .prepare("SELECT label, value FROM form_answers WHERE submission_id = ? ORDER BY id")
    .all(id) as Array<{ label: string; value: string }>;

  return { submission: mapSubmission(row), answers };
}

export function setSubmissionState(id: number, state: SubmissionRow["state"], memberId: number | null) {
  getDb()
    .prepare("UPDATE form_submissions SET state = ?, member_id = ?, handled_at = ? WHERE id = ?")
    .run(state, memberId, new Date().toISOString(), id);
}

/**
 * The whole registration rule in one place: the link must exist and be open,
 * every required question must carry something, and only questions this form
 * actually has are stored. The browser's copy of the field list is a
 * convenience — this is the authority.
 */
/**
 * Whether a question is actually being asked, given what has been answered so
 * far. A question hidden behind a condition is not merely invisible: it must
 * not be required, and an answer sent for it is not kept. Otherwise someone
 * who ticks "no allergies" is blocked by a question they were never shown,
 * and a browser that fails to clear a field writes an answer nobody gave.
 */
function isShown(field: Field, answers: Record<string, string>) {
  if (!field.showWhenFieldId) {
    return true;
  }
  return (answers[String(field.showWhenFieldId)] ?? "").trim() === field.showWhenValue;
}

export function submitForm(token: string, answers: Record<string, string>) {
  const form = getFormByToken(token);
  if (!form) {
    return { ok: false as const, error: "هذا الرابط غير موجود." };
  }
  if (form.status !== "open") {
    return { ok: false as const, error: "انتهى التسجيل عبر هذا الرابط." };
  }

  const fields = listFields(form.id);
  const collected: Array<{ fieldId: number; value: string }> = [];

  for (const field of fields) {
    if (!isShown(field, answers)) {
      continue;
    }

    const raw = answers[String(field.id)] ?? "";
    const value = raw.trim();

    if (field.required && !value) {
      return { ok: false as const, error: `هذا السؤال مطلوب: ${field.label}` };
    }

    if (field.mapsTo === "phone" && value && !formPhone(value)) {
      return { ok: false as const, error: `رقم الهاتف غير صالح: ${field.label}` };
    }

    collected.push({ fieldId: field.id, value });
  }

  return { ok: true as const, id: recordSubmission(form.id, collected) };
}
