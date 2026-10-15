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

test("a woman who mistyped her number the second time is still found", async () => {
  const { markDuplicates } = await import("@/app/lib/forms/report");

  // The pair that the phone match read as «0»: she registered twice and
  // one digit moved. Same name, so the table has to raise it.
  const marked = markDuplicates([
    { id: 1, name: "غدير تيتي", phone: "+972545549500" },
    { id: 2, name: "غدير تيتي", phone: "+972545579500" },
    { id: 3, name: "رزان غنايم", phone: "+972517717863" },
    { id: 4, name: "רזאן גנאים", phone: "+972547717863" },
    { id: 5, name: "سارة عوض", phone: "+972545227674" }
  ]);
  const at = (id: number) => marked.find((row) => row.id === id)!;

  assert.deepEqual(at(1).similarTo, [2], "same name, one digit apart");
  assert.deepEqual(at(1).duplicateOf, [], "and not called certain, because the phones differ");
  // One wrote her name in Arabic and the other in Hebrew — same woman.
  assert.deepEqual(at(3).similarTo, [4], "across the two scripts");
  assert.deepEqual(at(5).similarTo, [], "and a woman who registered once is left alone");
});

test("the same phone is still proof, and outranks the name", async () => {
  const { markDuplicates } = await import("@/app/lib/forms/report");
  const marked = markDuplicates([
    { id: 1, name: "هدى", phone: "+972545227683" },
    { id: 2, name: "هدى عواد", phone: "+972545227683" }
  ]);
  assert.deepEqual(marked[0].duplicateOf, [2], "same phone is certain");
  assert.deepEqual(marked[0].similarTo, [], "and it is not also listed as a guess");
});

test("two different women who share a name are flagged, never merged", async () => {
  const { markDuplicates } = await import("@/app/lib/forms/report");
  const marked = markDuplicates([
    { id: 1, name: "سارة عوض", phone: "+972521111111" },
    { id: 2, name: "سارة عوض", phone: "+972529999999" }
  ]);
  // Raised for a human to look at — and only ever as «تشابه», because the
  // numbers are nothing alike and two women really do share a name.
  assert.deepEqual(marked[0].similarTo, [2]);
  assert.deepEqual(marked[0].duplicateOf, []);
});
