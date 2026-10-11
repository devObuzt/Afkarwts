import { getDb } from "../db";
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
    const longest = grid.rows.reduce((most, row) => Math.max(most, (row.cells[index] ?? "").length), 0);
    const header = column.length;
    // The header wraps onto several lines happily; a value should not have to.
    const want = Math.max(Math.min(longest, 40), Math.min(header, 14), 6);
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
  rows: Array<{
    submissionId: number;
    memberId: number | null;
    state: string;
    submittedAt: string;
    cells: string[];
  }>;
};

/** A signature is a few thousand characters of base64; a table says whether it is there. */
function cellValue(value: string) {
  if (value.startsWith("data:image")) {
    return "موقّع";
  }
  return value;
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
  }

  const submissions = db
    .prepare(
      `SELECT id, state, submitted_at, member_id
         FROM form_submissions
        WHERE ${where.join(" AND ")}
        ORDER BY submitted_at, id`
    )
    .all(...args) as Array<Record<string, string | number | null>>;

  const answers = db.prepare("SELECT label, value FROM form_answers WHERE submission_id = ? ORDER BY id");

  const asked = listFields(formId).map((field) => field.label);
  const columns = [...asked];
  const rows: SubmissionGrid["rows"] = [];

  const collected = submissions.map((submission) => {
    const given = new Map<string, string>();
    for (const answer of answers.all(Number(submission.id)) as Array<{ label: string; value: string }>) {
      // A repeated label keeps the first answer: a duplicate question is a
      // form mistake, and dropping the earlier one loses what was said.
      if (!given.has(answer.label)) {
        given.set(answer.label, cellValue(answer.value));
      }
      if (!columns.includes(answer.label)) {
        // A question the form no longer asks, still answered in the past.
        columns.push(answer.label);
      }
    }
    return { submission, given };
  });

  for (const { submission, given } of collected) {
    rows.push({
      submissionId: Number(submission.id),
      memberId: submission.member_id === null ? null : Number(submission.member_id),
      state: String(submission.state),
      submittedAt: String(submission.submitted_at),
      cells: columns.map((column) => given.get(column) ?? "")
    });
  }

  return {
    formId,
    formName: form.name,
    groupName: form.groupName,
    columns,
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
