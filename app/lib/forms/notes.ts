import { getDb } from "../db";

/**
 * The columns Afkar fill in themselves, in the order they appear after the
 * phone. They are not answers: nobody who registered wrote them, so they
 * live in their own table and never travel with her answers.
 *
 * Deliberately dumb for now — five free-text columns, by Wisam's own
 * instruction: «مش بدي تفهمهن، رح نفهمهن لقدام». Giving one of them a
 * meaning later is a change here and nowhere else.
 */
export const NOTE_COLUMNS = [
  { key: "medical", label: "ملاحظات طبية" },
  { key: "ocean", label: "OCEAN" },
  { key: "sending", label: "ملاحظات للإرسال" },
  { key: "mashbaha", label: "مشبحة" },
  { key: "shaper", label: "SHAPER" }
] as const;

export type NoteKey = (typeof NOTE_COLUMNS)[number]["key"];

export function isNoteKey(value: string): value is NoteKey {
  return NOTE_COLUMNS.some((column) => column.key === value);
}

/** Every note on a form's registrations, as {submissionId: {key: value}}. */
export function notesForForm(formId: number) {
  const rows = getDb()
    .prepare(
      `SELECT n.submission_id, n.key, n.value
         FROM submission_notes n
         JOIN form_submissions s ON s.id = n.submission_id
        WHERE s.form_id = ?`
    )
    .all(formId) as Array<{ submission_id: number; key: string; value: string }>;

  const bySubmission = new Map<number, Record<string, string>>();
  for (const row of rows) {
    const held = bySubmission.get(row.submission_id) ?? {};
    held[row.key] = row.value;
    bySubmission.set(row.submission_id, held);
  }
  return bySubmission;
}

/**
 * Write one note. An empty value deletes the row rather than storing a
 * blank: «never filled in» and «cleared» read the same on the table, and
 * keeping both would only make the count of what is filled in a lie.
 */
export function setNote(submissionId: number, key: string, value: string) {
  if (!isNoteKey(key)) {
    return { ok: false as const, error: "عمود غير معروف." };
  }

  const db = getDb();
  const exists = db.prepare("SELECT id FROM form_submissions WHERE id = ?").get(submissionId);
  if (!exists) {
    return { ok: false as const, error: "هذا التسجيل غير موجود." };
  }

  const text = value.trim();
  if (!text) {
    db.prepare("DELETE FROM submission_notes WHERE submission_id = ? AND key = ?").run(submissionId, key);
    return { ok: true as const, value: "" };
  }

  db.prepare(
    `INSERT INTO submission_notes (submission_id, key, value, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (submission_id, key)
       DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run(submissionId, key, text);
  return { ok: true as const, value: text };
}
