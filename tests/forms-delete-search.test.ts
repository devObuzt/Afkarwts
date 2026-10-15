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

async function register(form: { id: number; token: string }, who: { name: string; phone: string; city?: string }) {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? who.name
        : field.mapsTo === "phone"
          ? who.phone
          : field.mapsTo === "city"
            ? who.city ?? "مجد الكروم"
            : field.kind === "date"
              ? "2026-10-02"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }
  const result = submitForm(form.token, answers);
  assert.equal(result.ok, true);
  return (result as { id: number }).id;
}

test("deleting a registration erases it and its answers for good", async () => {
  const { deleteSubmission } = await import("@/app/lib/forms/approve");
  const { getSubmission } = await import("@/app/lib/forms/store");
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { getDb } = await import("@/app/lib/db");
  const { form } = await cohort("كلين حذف");

  const staying = await register(form, { name: "سارة عوض", phone: "0545227680" });
  const test1 = await register(form, { name: "ماريا من الطاقم", phone: "0545227681" });

  const before = (getDb().prepare("SELECT COUNT(*) AS n FROM form_answers WHERE submission_id = ?").get(test1) as { n: number }).n;
  assert.ok(before > 0, "the registration had answers to begin with");

  assert.equal(deleteSubmission(test1).ok, true);
  assert.equal(getSubmission(test1), null, "the registration is gone");
  const left = (getDb().prepare("SELECT COUNT(*) AS n FROM form_answers WHERE submission_id = ?").get(test1) as { n: number }).n;
  assert.equal(left, 0, "and nothing of her answers is left behind");

  assert.deepEqual(submissionGrid(form.id)!.rows.map((r) => r.submissionId), [staying]);
  // Not in «المرفوضة» either: rejected hides, this removes.
  assert.deepEqual(submissionGrid(form.id, { state: "rejected" })!.rows, []);
  assert.equal(deleteSubmission(test1).ok, false, "deleting it twice is a named error");
});

test("deleting an approved registration takes her out of the path's group", async () => {
  const { approveSubmission, deleteSubmission } = await import("@/app/lib/forms/approve");
  const { findMemberByPhone, listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين خروج");

  const id = await register(form, { name: "ماريا حصارمة", phone: "0545227682" });
  approveSubmission(id);
  const member = findMemberByPhone("+972545227682")!;
  assert.ok(listGroupMembers(group.id).some((m) => m.id === member.id), "she is in the cohort");

  const result = deleteSubmission(id) as { ok: true; leftGroup: boolean };
  assert.equal(result.leftGroup, true);
  assert.ok(!listGroupMembers(group.id).some((m) => m.id === member.id), "and out of it after the delete");
  // Her own record stays: she may be staff, and a registration is not a
  // reason to erase a person.
  assert.ok(findMemberByPhone("+972545227682"), "the منتسبة herself is untouched");
});

test("a woman approved twice is not dropped by deleting one registration", async () => {
  const { approveSubmission, deleteSubmission } = await import("@/app/lib/forms/approve");
  const { findMemberByPhone, listGroupMembers } = await import("@/app/lib/db");
  const { form, group } = await cohort("كلين مكرر");

  const first = await register(form, { name: "هدى", phone: "0545227683" });
  const twin = await register(form, { name: "هدى عواد", phone: "0545227683" });
  approveSubmission(first);
  approveSubmission(twin);
  const member = findMemberByPhone("+972545227683")!;

  const result = deleteSubmission(twin) as { ok: true; leftGroup: boolean };
  assert.equal(result.leftGroup, false, "the other registration still says she belongs");
  assert.ok(listGroupMembers(group.id).some((m) => m.id === member.id), "so she stays in the cohort");
});

test("search looks at the whole row, and reads digits as digits", async () => {
  const { searchRows, submissionGrid } = await import("@/app/lib/forms/report");
  const { form } = await cohort("كلين بحث");

  await register(form, { name: "سارة عوض", phone: "0545227684", city: "عرابة" });
  await register(form, { name: "ليلى حسن", phone: "0526805262", city: "كابول" });

  const grid = submissionGrid(form.id)!;
  const found = (q: string) => searchRows(grid.rows, q).map((r) => r.cells[0]);

  assert.deepEqual(found("ليلى"), ["ليلى حسن"], "by name");
  assert.deepEqual(found("كابول"), ["ليلى حسن"], "by town");
  // The form stores «+972526805262»; nobody types it that way.
  assert.deepEqual(found("052-680-5262"), ["ليلى حسن"], "by a phone written the way people write it");
  assert.deepEqual(found("0545227684"), ["سارة عوض"], "and by the other one");
  // The form stores the phone with no national zero, so a search that
  // starts with one has to find it anyway — it found nothing before.
  assert.deepEqual(found("+972526805262"), ["ليلى حسن"], "written as the system stores it");
  assert.deepEqual(found("972526805262"), ["ليلى حسن"], "and without the plus");
  assert.equal(found("").length, 2, "an empty search is not a filter");
  assert.equal(found("لا أحد").length, 0);
  // Two digits are not a phone — they are in every row.
  assert.equal(found("52").length, 2, "a stub too short to be a number is left to the text search");
});

test("the screen, the CSV and the PDF are handed the same query", async () => {
  const { viewQuery } = await import("@/app/lib/forms/report");
  assert.equal(viewQuery({}), "");
  assert.equal(viewQuery({ state: "rejected" }), "?state=rejected");
  assert.equal(viewQuery({ q: "ليلى" }), `?q=${encodeURIComponent("ليلى")}`);
  assert.equal(viewQuery({ state: "new", q: "054" }), "?state=new&q=054");
});
