import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function cohort(name: string) {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`${name} ${seq}`);
  return { group, form: createForm({ name: `${name} ${seq}`, groupId: group.id, fromTemplate: true }) };
}

async function register(form: { id: number; token: string }, who: { name: string; phone: string }) {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? who.name
        : field.mapsTo === "phone"
          ? who.phone
          : field.mapsTo === "city"
            ? "مجد الكروم"
            : field.kind === "date"
              ? "2026-10-02"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }
  const result = submitForm(form.token, answers, { requirePhoneCode: false });
  assert.equal(result.ok, true);
  return (result as { id: number }).id;
}

test("a rejected registration leaves the table, the CSV and the count", async () => {
  const { rejectSubmission } = await import("@/app/lib/forms/approve");
  const { gridToCsv, submissionGrid } = await import("@/app/lib/forms/report");
  const { listForms } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين مرفوض");

  const staying = await register(form, { name: "سارة عوض", phone: "0545227674" });
  const leaving = await register(form, { name: "ليلى حسن", phone: "0545227675" });
  rejectSubmission(leaving);

  const grid = submissionGrid(form.id)!;
  const ids = grid.rows.map((row) => row.submissionId);
  assert.deepEqual(ids, [staying], "«الكل» shows only the registration still standing");

  // The file is the same gate, not a second one: this is what gets mailed.
  assert.ok(!gridToCsv(grid).includes("ليلى حسن"), "and the CSV built from it carries nobody rejected");

  const card = listForms().find((row) => row.id === form.id)!;
  assert.equal(card.submissionCount, 1, "the card over the table counts what the table shows");
});

test("«المرفوضة» is where a rejected registration still is, and the only way back", async () => {
  const { rejectSubmission, restoreSubmission } = await import("@/app/lib/forms/approve");
  const { rejectedCount, submissionGrid } = await import("@/app/lib/forms/report");
  const { getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين إرجاع");

  const id = await register(form, { name: "ليلى حسن", phone: "0545227676" });
  rejectSubmission(id);

  assert.equal(rejectedCount(form.id), 1, "the tab carries its own count");
  const rejected = submissionGrid(form.id, { state: "rejected" })!;
  assert.deepEqual(rejected.rows.map((row) => row.submissionId), [id], "asking for it by name brings it back");

  const back = restoreSubmission(id);
  assert.equal(back.ok, true);
  // Waiting, not in the group: letting her in stays its own decision.
  assert.equal(getSubmission(id)!.submission.state, "new");
  assert.equal(getSubmission(id)!.submission.memberId, null);
  assert.equal(rejectedCount(form.id), 0);
  assert.deepEqual(submissionGrid(form.id)!.rows.map((row) => row.submissionId), [id]);

  // Restoring twice is a mistake worth naming, not a silent second write.
  const again = restoreSubmission(id);
  assert.equal(again.ok, false);
});

test("rejecting one of a pair is what resolves the duplicate warning", async () => {
  const { rejectSubmission } = await import("@/app/lib/forms/approve");
  const { duplicateCount, submissionGrid } = await import("@/app/lib/forms/report");
  const { form } = await cohort("كلين تكرار");

  const first = await register(form, { name: "سارة عوض", phone: "0545227677" });
  const second = await register(form, { name: "سارة عوض", phone: "0545227677" });
  assert.equal(duplicateCount(form.id), 2, "two registrations, one phone");

  rejectSubmission(second);
  assert.equal(duplicateCount(form.id), 0, "and the warning comes down once one is rejected");
  const grid = submissionGrid(form.id)!;
  assert.deepEqual(grid.rows.map((row) => row.submissionId), [first]);
  assert.deepEqual(grid.rows[0].duplicateOf, [], "the one left standing is no longer somebody's twin");
});
