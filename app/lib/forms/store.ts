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

/**
 * The shortest number that can become a member.
 *
 * createMember refuses anything under eight characters, so a registration
 * below that can be taken and then never approved — which is what happened:
 * «+535353» sat in the queue and «أضف للمجموعة» answered 500. The limit
 * belongs at the door, where the person can still fix their own typo.
 */
export const MIN_PHONE_LENGTH = 8;

export function phoneIsUsable(phone: string) {
  return phone.length >= MIN_PHONE_LENGTH;
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
    .prepare(
      `SELECT form_answers.id, form_answers.label, form_answers.value,
              form_fields.kind, form_fields.options, form_fields.map_to
         FROM form_answers
         LEFT JOIN form_fields ON form_fields.id = form_answers.field_id
        WHERE form_answers.submission_id = ? ORDER BY form_answers.id`
    )
    .all(id) as Array<{
    id: number;
    label: string;
    value: string;
    kind: string | null;
    options: string | null;
    map_to: string | null;
  }>;

  return {
    submission: mapSubmission(row),
    answers: answers.map((answer) => ({
      id: answer.id,
      label: answer.label,
      value: answer.value,
      // A question the form no longer asks has no kind: it is still
      // editable, as plain text, because the answer is still somebody's.
      kind: answer.kind ?? "text",
      options: (() => {
        try {
          const parsed = JSON.parse(answer.options ?? "[]");
          return Array.isArray(parsed) ? parsed.map(String) : [];
        } catch {
          return [];
        }
      })(),
      mapsTo: answer.map_to ?? ""
    }))
  };
}

/**
 * A registration, after it arrived, with somebody's typo in it.
 *
 * Until now nothing could touch one: a phone keyed in wrong meant the
 * approval made a member nobody could reach, and a town or a health answer
 * entered in the wrong box stayed wrong for good.
 *
 * The part that is easy to get wrong: the submission's own `name`, `phone`
 * and `city` are not stored twice over — they are **derived** from the
 * answers at submit time through each field's `mapsTo`. Correcting the
 * phone answer without re-deriving them would leave the column holding the
 * old number, and approval would go on making a member from it. So every
 * edit re-reads the mapped answers and writes the three columns again,
 * through the same normaliser the public form uses.
 */
export function updateSubmissionAnswers(
  submissionId: number,
  edits: Array<{ answerId: number; value: string }>,
  options: { mayEditMember?: boolean } = {}
) {
  const db = getDb();

  // Read before writing: the member is found by who this registration
  // belonged to *before* the edit. Looking her up afterwards by the new
  // phone meant that typing another woman's number into an unlinked
  // registration found **her** record and overwrote her name and town.
  const submission = db
    .prepare("SELECT id, form_id, member_id, phone FROM form_submissions WHERE id = ?")
    .get(submissionId) as
    | { id: number; form_id: number; member_id: number | null; phone: string }
    | undefined;
  if (!submission) {
    throw new Error("هذا التسجيل غير موجود.");
  }

  const rows = db
    .prepare("SELECT id, field_id, label, value FROM form_answers WHERE submission_id = ?")
    .all(submissionId) as Array<{ id: number; field_id: number | null; label: string; value: string }>;
  const byId = new Map(rows.map((row) => [row.id, row]));

  // Which questions changed, for the log. Never the answers themselves —
  // see the note in the API route.
  const changed: string[] = [];
  /** Which of her own details the correction carried through to. */
  const reached: string[] = [];
  let memberId: number | null = null;
  let phoneTaken = false;
  let memberBlocked = false;

  db.exec("BEGIN IMMEDIATE");
  try {
    const write = db.prepare("UPDATE form_answers SET value = ? WHERE id = ? AND submission_id = ?");
    for (const edit of edits) {
      const row = byId.get(edit.answerId);
      // An answer id that belongs to another registration is not an edit.
      if (!row || row.value === edit.value) {
        continue;
      }
      write.run(edit.value, edit.answerId, submissionId);
      row.value = edit.value;
      changed.push(row.label);
    }

    if (changed.length > 0) {
      const fields = new Map(listFields(submission.form_id).map((field) => [field.id, field]));
      let name = "";
      let phone = "";
      let city = "";
      for (const row of rows) {
        const field = row.field_id === null ? undefined : fields.get(row.field_id);
        if (!field) {
          continue;
        }
        if (field.mapsTo === "name") {
          name = row.value.trim();
        } else if (field.mapsTo === "phone") {
          phone = formPhone(row.value);
        } else if (field.mapsTo === "city") {
          city = row.value.trim();
        }
      }

      db.prepare("UPDATE form_submissions SET name = ?, phone = ?, city = ? WHERE id = ?").run(
        name,
        phone,
        city,
        submissionId
      );

      // And the منتسب herself. Rewriting only the registration left the
      // correction invisible everywhere that matters: the people list,
      // the search, the conversation header — all of which read `members`.
      // The registration is where her details came from, so a correction
      // to it is a correction to her.
      // Her record, identified by what the registration was before this
      // edit: the link if it has one, otherwise the number it arrived
      // with. Never the corrected number — that is somebody else's key.
      const findById = db.prepare("SELECT id, name, phone, city FROM members WHERE id = ?");
      const findByPhone = db.prepare("SELECT id, name, phone, city FROM members WHERE phone = ?");
      const member = (submission.member_id
        ? findById.get(submission.member_id)
        : submission.phone
          ? findByPhone.get(submission.phone)
          : undefined) as { id: number; name: string; phone: string; city: string } | undefined;

      // Changing her name, town or number is editing a منتسبة, so it takes
      // the permission for that. Without it the registration is still
      // corrected and the caller is told her record was left alone.
      if (member && !options.mayEditMember) {
        memberId = member.id;
        memberBlocked = true;
      } else if (member) {
        if (name && name !== member.name) {
          db.prepare("UPDATE members SET name = ? WHERE id = ?").run(name, member.id);
          reached.push("الاسم");
        }
        if (city && city !== member.city) {
          db.prepare("UPDATE members SET city = ? WHERE id = ?").run(city, member.id);
          reached.push("البلدة");
        }
        if (phone && phone !== member.phone) {
          // The phone is unique and is her WhatsApp identity. If the
          // corrected number already belongs to somebody else, hers is
          // left alone and the caller is told — overwriting would merge
          // two people by accident.
          const taken = db
            .prepare("SELECT id FROM members WHERE phone = ? AND id <> ?")
            .get(phone, member.id) as { id: number } | undefined;
          if (taken) {
            phoneTaken = true;
          } else {
            db.prepare("UPDATE members SET phone = ? WHERE id = ?").run(phone, member.id);
            reached.push("الهاتف");
          }
        }
        memberId = member.id;
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return { changed, reached, memberId, phoneTaken, memberBlocked };
}

/**
 * The Hebrew name or town, as somebody checked it.
 *
 * Storing it is the confirmation: an empty column means the screen is
 * still showing a suggestion. Saving the suggestion unchanged is
 * therefore a real act — it says a person read it and agreed.
 */
export function setHebrewFields(submissionId: number, patch: { name?: string; city?: string }) {
  const db = getDb();
  const exists = db.prepare("SELECT id FROM form_submissions WHERE id = ?").get(submissionId);
  if (!exists) {
    throw new Error("هذا التسجيل غير موجود.");
  }

  const saved: string[] = [];
  if (patch.name !== undefined) {
    db.prepare("UPDATE form_submissions SET hebrew_name = ? WHERE id = ?").run(patch.name.trim(), submissionId);
    saved.push("الاسم بالعبرية");
  }
  if (patch.city !== undefined) {
    db.prepare("UPDATE form_submissions SET hebrew_city = ? WHERE id = ?").run(patch.city.trim(), submissionId);
    saved.push("البلدة بالعبرية");
  }
  return saved;
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

  const given = (answers[String(field.showWhenFieldId)] ?? "").trim();
  // A pick-several answer is its ticked boxes joined together, so the gate
  // asks whether one box is among them. A single answer is a list of one, and
  // membership and equality say the same thing.
  return given === field.showWhenValue || given.split("، ").includes(field.showWhenValue);
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

    if (field.mapsTo === "phone" && value && !phoneIsUsable(formPhone(value))) {
      return { ok: false as const, error: `رقم الهاتف غير صالح: ${field.label}` };
    }

    collected.push({ fieldId: field.id, value });
  }

  return { ok: true as const, id: recordSubmission(form.id, collected) };
}
