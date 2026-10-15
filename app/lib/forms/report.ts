import { getDb } from "../db";
import { hebrewNameFor } from "./hebrew-name";
import { hebrewTownFor } from "./hebrew-town";
import { getForm, listFields } from "./store";

/**
 * A cohort's registrations as one table.
 *
 * Afkar reads these in a spreadsheet today — one row per person, the
 * questions across the top — because that is the shape the answer is
 * wanted in: who is pregnant, who takes medication, who is allergic to
 * what, all at once, before a week's programmes are written.
 *
 * Columns come from the form's current questions, then any question an
 * older registration answered that the form no longer asks. Answers carry
 * their own question text, so an edited form does not silently re-label
 * what somebody said months ago.
 */

/** A phone, an id, a date: a value that means nothing split across lines. */
export function isNumeric(value: string) {
  return /^[\d+\-/.() ]{5,}$/.test(value.trim());
}

/**
 * The short name a question prints under.
 *
 * Chromium repeats a table header on every printed page only while the
 * header is under a quarter of the page. Afkar's consent questions run to
 * a full paragraph each, which made the header 342px of a 718px sheet —
 * so it printed once and pages two and three came out as columns of «لا»
 * with nothing saying what was asked. A long question prints as its
 * number and is spelled out in the key under the table.
 */
export const SHORT_HEADER = 24;

export function printHeader(column: string, index: number) {
  return column.length <= SHORT_HEADER ? column : `س${index + 1}`;
}

/** The questions that print as a number, and what each one says. */
export function headerKey(columns: string[]) {
  return columns
    .map((column, index) => ({ short: printHeader(column, index), label: column }))
    .filter((entry) => entry.short !== entry.label);
}

/**
 * How wide each column should be on a printed page.
 *
 * Fixed layout divides the page evenly, which gives a consent paragraph
 * the same room as a phone — and a phone that does not fit spills over
 * its neighbour. Columns are weighted by what is actually in them: short
 * values get a little, long prose gets the rest.
 */
export function columnWidths(grid: { columns: string[]; rows: Array<{ cells: string[] }> }) {
  // The index and the date are columns too. Leaving them out of the sum
  // made the table 109% wide, and the id printed on top of the phone.
  const leading = [3, 7];

  const answers = grid.columns.map((column, index) => {
    const values = grid.rows.map((row) => row.cells[index] ?? "").filter((value) => value.trim() !== "");
    const longest = values.reduce((most, value) => Math.max(most, value.length), 0);
    // What the header prints as, not what it says: a paragraph-long
    // question prints as «س7». Counting the full text gave fourteen
    // yes/no columns the sheet and left the phone spilling over the id.
    const header = printHeader(column, index);
    // A sentence folds onto three or four lines and reads the same. A
    // phone or an id cannot fold, so its column has to hold the whole run
    // on one line.
    const unwrappable = values.length > 0 && values.every((value) => isNumeric(value));
    // The longest word in the column, header included. Nothing can be
    // narrower than that without breaking a word in half — «التوقيع»
    // came out as «التوقي» over «ع» at the head of every printed page.
    const words = [header, ...values].flatMap((value) => value.split(/\s+/));
    const atom = words.reduce((most, word) => Math.max(most, word.length), 0);
    const want = unwrappable
      ? Math.max(longest + 2, 8)
      : Math.max(Math.min(Math.ceil(longest / 2.5), 22), atom + 2, 6);
    return want;
  });

  const share = 100 - leading.reduce((sum, value) => sum + value, 0);
  const total = answers.reduce((sum, weight) => sum + weight, 0) || 1;

  return [
    ...leading.map((value) => `${value}%`),
    ...answers.map((weight) => `${Math.round((weight / total) * share * 100) / 100}%`)
  ];
}

export type SubmissionGrid = {
  formId: number;
  formName: string;
  groupName: string;
  columns: string[];
  /**
   * Which column holds the town, so the table can drop it: the Hebrew
   * town column already carries the same answer in the form Afkar's
   * records use, and two town columns is one too many.
   */
  cityColumn: number | null;
  rows: Array<{
    submissionId: number;
    memberId: number | null;
    state: string;
    submittedAt: string;
    cells: string[];
    /** Her phone as stored, so the table can group two registrations as one woman. */
    phone: string;
    /**
     * Her name and town in Hebrew — the form of them Afkar's records end
     * up in. `confirmed` is false while it is still only a suggestion
     * carried across letter by letter, so a checked name and a guess
     * never look the same on screen.
     */
    hebrew: { name: string; nameConfirmed: boolean; city: string; cityConfirmed: boolean };
    /**
     * The other registrations on this form that carry the same phone.
     * Same number, same form, same woman — she filled it twice. A woman
     * who registers for two different cohorts is not a duplicate, so this
     * never looks outside the form.
     */
    duplicateOf: number[];
    /**
     * The answer row behind each cell, so the table can edit in place.
     * Null where this registration never answered that question — there is
     * no row to patch, and inventing one would make a field the form did
     * not ask look answered.
     */
    answerIds: Array<number | null>;
  }>;
};

/** A signature is a few thousand characters of base64; a table says whether it is there. */
function cellValue(value: string) {
  if (value.startsWith("data:image")) {
    return "موقّع";
  }
  return value;
}

/**
 * The Hebrew name and town for one registration.
 *
 * A value somebody typed wins. Otherwise the name is carried across from
 * Arabic letter by letter and the town is looked up — and either way the
 * row says it is only a suggestion, because Afkar will rely on these.
 */
function hebrewFor(row: Record<string, string | number | null>) {
  const storedName = String(row.hebrew_name ?? "").trim();
  const storedCity = String(row.hebrew_city ?? "").trim();
  return {
    name: storedName || hebrewNameFor(String(row.name ?? "")),
    nameConfirmed: storedName !== "",
    city: storedCity || hebrewTownFor(String(row.city ?? "")),
    cityConfirmed: storedCity !== ""
  };
}

/**
 * How many registrations on this form share a phone with another.
 *
 * Counted across the whole form, never within the current filter: the
 * button says «المكررات (10)» and that has to be ten whichever view is
 * open, or pressing it from «بانتظار المراجعة» would promise two and
 * show ten.
 *
 * A rejected registration is not counted, because rejecting one of a pair
 * is exactly how a duplicate is resolved. Leaving it in would keep the
 * warning up over a pair somebody already dealt with.
 */
export function duplicateCount(formId: number) {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(n), 0) AS total FROM (
         SELECT COUNT(*) AS n FROM form_submissions
          WHERE form_id = ? AND TRIM(phone) <> '' AND state <> 'rejected'
          GROUP BY phone HAVING COUNT(*) > 1
       )`
    )
    .get(formId) as { total: number };
  return Number(row?.total ?? 0);
}

/** How many registrations on this form were rejected — the tab's own count. */
export function rejectedCount(formId: number) {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS total FROM form_submissions WHERE form_id = ? AND state = 'rejected'")
    .get(formId) as { total: number };
  return Number(row?.total ?? 0);
}

/**
 * The query string every way out of the table shares: the screen, the CSV
 * and the PDF. When a search is on, what downloads is what is on screen —
 * anything else and «نزّل Excel» quietly hands over a different set.
 */
export function viewQuery(view: { state?: string; q?: string }) {
  const params = new URLSearchParams();
  if (view.state) params.set("state", view.state);
  if (view.q) params.set("q", view.q);
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** The rows of a grid that match a search of the whole row. */
export function searchRows<T extends { cells: string[]; phone: string; hebrew: { name: string; city: string } }>(
  rows: T[],
  search: string
) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return rows;
  }
  const digits = needle.replace(/\D/g, "");
  // «054-123» has to find a phone the form stored as «+972 54-123», so the
  // search is tried as typed, without the national zero, and with the
  // country code in its place. Matching the digits raw was not enough: the
  // stored number has no leading zero, so «0545…» found nothing at all.
  const national = digits.replace(/^0+/, "").replace(/^972/, "");
  const forms = digits.length >= 3 ? [...new Set([digits, national, `972${national}`])].filter(Boolean) : [];
  return rows.filter((row) => {
    const text = [...row.cells, row.hebrew.name, row.hebrew.city, row.phone].join(" ").toLowerCase();
    if (text.includes(needle)) {
      return true;
    }
    const bare = text.replace(/\D/g, "");
    return forms.some((form) => bare.includes(form));
  });
}

export function submissionGrid(formId: number, filter: { state?: string } = {}): SubmissionGrid | null {
  const form = getForm(formId);
  if (!form) {
    return null;
  }

  const db = getDb();

  const where = ["form_submissions.form_id = ?"];
  const args: Array<string | number> = [formId];
  if (filter.state) {
    where.push("form_submissions.state = ?");
    args.push(filter.state);
  } else {
    // A rejected registration leaves the table. This is the one gate every
    // reader of the cohort inherits — the screen, the CSV and the PDF all
    // come through here — so «rejected» means out of the list everywhere,
    // not out of one view. Asking for it by name is the only way back in.
    where.push("form_submissions.state <> 'rejected'");
  }

  const submissions = db
    .prepare(
      `SELECT id, state, submitted_at, member_id, phone, name, city,
              hebrew_name, hebrew_city
         FROM form_submissions
        WHERE ${where.join(" AND ")}
        ORDER BY submitted_at, id`
    )
    .all(...args) as Array<Record<string, string | number | null>>;

  const answers = db.prepare("SELECT id, label, value FROM form_answers WHERE submission_id = ? ORDER BY id");

  const asked = listFields(formId).map((field) => field.label);
  const columns = [...asked];
  const rows: SubmissionGrid["rows"] = [];

  const collected = submissions.map((submission) => {
    const given = new Map<string, string>();
    const ids = new Map<string, number>();
    for (const answer of answers.all(Number(submission.id)) as Array<{
      id: number;
      label: string;
      value: string;
    }>) {
      // A repeated label keeps the first answer: a duplicate question is a
      // form mistake, and dropping the earlier one loses what was said.
      if (!given.has(answer.label)) {
        given.set(answer.label, cellValue(answer.value));
        ids.set(answer.label, answer.id);
      }
      if (!columns.includes(answer.label)) {
        // A question the form no longer asks, still answered in the past.
        columns.push(answer.label);
      }
    }
    return { submission, given, ids };
  });

  // One pass over the phones first: a row has to know about a twin that
  // comes after it as well as one before.
  const byPhone = new Map<string, number[]>();
  for (const { submission } of collected) {
    const phone = String(submission.phone ?? "").trim();
    if (!phone) {
      continue;
    }
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), Number(submission.id)]);
  }

  for (const { submission, given, ids } of collected) {
    const phone = String(submission.phone ?? "").trim();
    const sharing = (byPhone.get(phone) ?? []).filter((id) => id !== Number(submission.id));
    rows.push({
      submissionId: Number(submission.id),
      memberId: submission.member_id === null ? null : Number(submission.member_id),
      state: String(submission.state),
      submittedAt: String(submission.submitted_at),
      cells: columns.map((column) => given.get(column) ?? ""),
      answerIds: columns.map((column) => ids.get(column) ?? null),
      phone,
      duplicateOf: sharing,
      hebrew: hebrewFor(submission)
    });
  }

  const cityField = listFields(formId).find((field) => field.mapsTo === "city");
  return {
    formId,
    formName: form.name,
    groupName: form.groupName,
    columns,
    cityColumn: cityField ? columns.indexOf(cityField.label) : null,
    rows
  };
}

const STATE_LABEL: Record<string, string> = {
  new: "بانتظار المراجعة",
  added: "في المجموعة",
  rejected: "مرفوض"
};

/**
 * The same table as a file Excel will open.
 *
 * A BOM, because without it Excel reads UTF-8 Arabic as mojibake; CRLF,
 * because that is what it expects to see between rows.
 */
export function gridToCsv(grid: SubmissionGrid) {
  // The registration form is public: anyone with the link can type
  // «=HYPERLINK(...)» into a question, and Excel runs a cell that opens
  // with = + - @ or a tab as a formula when Afkar opens the file. A
  // leading apostrophe marks it as text; Excel does not display it.
  const neutralise = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
  const escape = (value: string) => `"${neutralise(String(value ?? "")).replace(/"/g, '""')}"`;

  const header = ["#", "التاريخ", "الحالة", ...grid.columns].map(escape).join(",");
  const lines = grid.rows.map((row, index) =>
    [
      String(index + 1),
      row.submittedAt.slice(0, 16),
      STATE_LABEL[row.state] ?? row.state,
      ...row.cells
    ]
      .map(escape)
      .join(",")
  );

  return `﻿${[header, ...lines].join("\r\n")}\r\n`;
}
