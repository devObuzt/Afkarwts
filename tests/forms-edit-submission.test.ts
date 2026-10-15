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

async function register(
  form: { id: number; token: string },
  who: { name: string; phone: string; city?: string }
) {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? who.name
        : field.mapsTo === "phone"
          ? who.phone
          : field.mapsTo === "city"
            ? who.city ?? "—"
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

async function answerFor(submissionId: number, mapsTo: string) {
  const { getSubmission } = await import("@/app/lib/forms/store");
  return getSubmission(submissionId)!.answers.find((answer) => answer.mapsTo === mapsTo)!;
}

test("fixing the phone answer fixes the phone the approval will use", async () => {
  const { getSubmission, updateSubmissionAnswers } = await import("@/app/lib/forms/store");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { findMemberByPhone } = await import("@/app/lib/db");

  const { form } = await cohort("كلين");
  // One digit short of her real number.
  const id = await register(form, { name: "سناء حاج", phone: "054522767", city: "عرابة" });
  assert.equal(getSubmission(id)!.submission.phone, "+97254522767");

  const phone = await answerFor(id, "phone");
  const { changed } = updateSubmissionAnswers(id, [{ answerId: phone.id, value: "0545227674" }]);
  assert.equal(changed.length, 1);

  // The column is derived, not stored twice: this is the whole point.
  assert.equal(getSubmission(id)!.submission.phone, "+972545227674");

  const result = approveSubmission(id) as { ok: true; memberId: number };
  assert.equal(result.ok, true);
  assert.ok(findMemberByPhone("+972545227674"), "the member is reachable on the corrected number");
  assert.equal(findMemberByPhone("+97254522767"), null, "and not on the typo");
});

test("fixing the name and the town carries into the submission too", async () => {
  const { getSubmission, updateSubmissionAnswers } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين");
  const id = await register(form, { name: "سناء", phone: "0545227675", city: "عرابه" });

  const name = await answerFor(id, "name");
  const city = await answerFor(id, "city");
  updateSubmissionAnswers(id, [
    { answerId: name.id, value: "سناء حاج" },
    { answerId: city.id, value: "عرابة" }
  ]);

  const after = getSubmission(id)!.submission;
  assert.equal(after.name, "سناء حاج");
  assert.equal(after.city, "عرابة");
});

test("a health answer is corrected, and only what changed is reported", async () => {
  const { getSubmission, updateSubmissionAnswers } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين");
  const id = await register(form, { name: "هدى", phone: "0545227676" });

  const answers = getSubmission(id)!.answers;
  const health = answers.find((answer) => !answer.mapsTo && answer.kind !== "signature")!;

  const { changed } = updateSubmissionAnswers(id, [
    { answerId: health.id, value: "ضغط دم" },
    // Sent unchanged: not an edit, and not in the log.
    { answerId: answers[0].id, value: answers[0].value }
  ]);

  assert.deepEqual(changed, [health.label]);
  assert.equal(getSubmission(id)!.answers.find((a) => a.id === health.id)!.value, "ضغط دم");
});

test("an answer belonging to another registration cannot be reached", async () => {
  const { getSubmission, updateSubmissionAnswers } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين");
  const mine = await register(form, { name: "ريم", phone: "0545227677" });
  const hers = await register(form, { name: "لينا", phone: "0545227678" });

  const herAnswer = await answerFor(hers, "name");
  const { changed } = updateSubmissionAnswers(mine, [{ answerId: herAnswer.id, value: "اسم مدسوس" }]);

  assert.deepEqual(changed, [], "nothing changed");
  assert.equal(getSubmission(hers)!.submission.name, "لينا", "and her registration is untouched");
});

test("editing a registration that is not there is refused, not half-done", async () => {
  const { updateSubmissionAnswers } = await import("@/app/lib/forms/store");
  assert.throws(() => updateSubmissionAnswers(999_999, [{ answerId: 1, value: "x" }]), /غير موجود/);
});

test("a correction that leaves the phone too short still saves, and says so", async () => {
  const { getSubmission, phoneIsUsable, updateSubmissionAnswers } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين");
  const id = await register(form, { name: "منى", phone: "0545227679" });

  const phone = await answerFor(id, "phone");
  updateSubmissionAnswers(id, [{ answerId: phone.id, value: "0545" }]);

  // The correction is kept — refusing it would strand the registration on
  // the older, equally wrong number — and the screen warns instead.
  const after = getSubmission(id)!.submission.phone;
  assert.equal(phoneIsUsable(after), false, "and «أضف للمجموعة» would still refuse it");
});

test("the report grid carries the answer row behind each cell", async () => {
  const { submissionGrid, updateSubmissionAnswers } = await import("@/app/lib/forms/report").then(
    async (report) => ({ ...report, ...(await import("@/app/lib/forms/store")) })
  );
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");

  const group = createGroup("كلين للجدول");
  const form = createForm({ name: "تسجيل الجدول", groupId: group.id, fromTemplate: true });
  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? "ريم"
        : field.mapsTo === "phone"
          ? "0545227690"
          : field.mapsTo === "city"
            ? "عرابة"
            : field.kind === "date"
              ? "2026-10-02"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }
  const sent = submitForm(form.token, answers) as { ok: true; id: number };

  const grid = submissionGrid(form.id)!;
  const row = grid.rows[0];

  assert.equal(row.cells.length, row.answerIds.length, "one id per cell, or the table edits the wrong one");

  // Editing through the id the table would send changes that same cell.
  const index = grid.columns.findIndex((column) => column.includes("الاسم"));
  const id = row.answerIds[index];
  assert.ok(id, "the name cell has a row behind it");
  updateSubmissionAnswers(sent.id, [{ answerId: id!, value: "ريم زيدات" }]);

  assert.equal(submissionGrid(form.id)!.rows[0].cells[index], "ريم زيدات");
});

test("a question this registration never answered has no cell to patch", async () => {
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { addField, createForm, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { createGroup } = await import("@/app/lib/db");

  const group = createGroup("كلين بسؤال جديد");
  const form = createForm({ name: "تسجيل", groupId: group.id, fromTemplate: true });
  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "phone" ? "0545227691" : field.kind === "date" ? "2026-10-02" : field.options.length ? field.options[0] : "نعم";
  }
  submitForm(form.token, answers);

  // Asked after she replied: her row has nothing behind that column, and
  // the table must not offer to edit a row that does not exist.
  addField(form.id, { label: "سؤال أُضيف لاحقاً", kind: "text" });
  const grid = submissionGrid(form.id)!;
  const index = grid.columns.indexOf("سؤال أُضيف لاحقاً");
  assert.ok(index >= 0);
  assert.equal(grid.rows[0].answerIds[index], null);
});

test("a correction reaches the منتسبة herself, not only her registration", async () => {
  const { findMemberByPhone, getMember } = await import("@/app/lib/db");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { getSubmission, updateSubmissionAnswers } = await import("@/app/lib/forms/store");

  const { form } = await cohort("كلين");
  const id = await register(form, { name: "سناء", phone: "0545227700", city: "عرابه" });
  const approved = approveSubmission(id) as { ok: true; memberId: number };
  assert.equal(approved.ok, true);

  const name = await answerFor(id, "name");
  const city = await answerFor(id, "city");
  const phone = await answerFor(id, "phone");
  const result = updateSubmissionAnswers(
    id,
    [
      { answerId: name.id, value: "سناء حاج" },
      { answerId: city.id, value: "عرابة" },
      { answerId: phone.id, value: "0545227701" }
    ],
    { mayEditMember: true }
  );

  // The whole point: the people list reads `members`, so a correction that
  // stops at the registration is a correction nobody sees.
  const member = getMember(approved.memberId)!;
  assert.equal(member.name, "سناء حاج");
  assert.equal(member.city, "عرابة");
  assert.equal(member.phone, "+972545227701");
  assert.deepEqual(result.reached.sort(), ["الاسم", "البلدة", "الهاتف"]);
  assert.ok(findMemberByPhone("+972545227701"));
  assert.equal(getSubmission(id)!.submission.phone, "+972545227701");
});

test("a corrected phone that belongs to somebody else is refused, not merged", async () => {
  const { createMember, getMember } = await import("@/app/lib/db");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { updateSubmissionAnswers } = await import("@/app/lib/forms/store");

  const { form } = await cohort("كلين");
  const id = await register(form, { name: "ليلى", phone: "0545227702" });
  const approved = approveSubmission(id) as { ok: true; memberId: number };

  // Somebody else already holds the number the correction types in.
  createMember({ name: "منى", phone: "+972545227703" });

  const phone = await answerFor(id, "phone");
  const result = updateSubmissionAnswers(id, [{ answerId: phone.id, value: "0545227703" }], {
    mayEditMember: true
  });

  assert.equal(result.phoneTaken, true, "the collision is reported");
  assert.equal(getMember(approved.memberId)!.phone, "+972545227702", "and her number is left alone");
  assert.ok(!result.reached.includes("الهاتف"));
});

test("two registrations on one phone mark each other, across the whole form", async () => {
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { form } = await cohort("كلين");

  const first = await register(form, { name: "ريم", phone: "0545227710" });
  const other = await register(form, { name: "لينا", phone: "0545227711" });
  const twin = await register(form, { name: "ريم زيدات", phone: "0545227710" });

  const grid = submissionGrid(form.id)!;
  const byId = new Map(grid.rows.map((row) => [row.submissionId, row]));

  // Each knows about the other, including the one that arrived first — a
  // row has to see a twin that comes after it, not only before.
  assert.deepEqual(byId.get(first)!.duplicateOf, [twin]);
  assert.deepEqual(byId.get(twin)!.duplicateOf, [first]);
  assert.deepEqual(byId.get(other)!.duplicateOf, [], "a different number is not a duplicate");
});

test("rejecting a duplicate leaves the منتسبة and her other registration alone", async () => {
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { approveSubmission, rejectSubmission } = await import("@/app/lib/forms/approve");
  const { getSubmission } = await import("@/app/lib/forms/store");
  const { findMemberByPhone } = await import("@/app/lib/db");

  const { form } = await cohort("كلين");
  const first = await register(form, { name: "هدى", phone: "0545227712" });
  const twin = await register(form, { name: "هدى عواد", phone: "0545227712" });

  // Both accepted — which is exactly when the duplicate starts to hurt.
  approveSubmission(first);
  approveSubmission(twin, { overwrite: true });
  const member = findMemberByPhone("+972545227712")!;

  rejectSubmission(twin);

  assert.equal(getSubmission(twin)!.submission.state, "rejected");
  assert.equal(getSubmission(first)!.submission.state, "added", "her real registration stands");
  assert.ok(findMemberByPhone("+972545227712"), "and she is still a منتسبة");
  assert.equal(findMemberByPhone("+972545227712")!.id, member.id);

  // The mark stays on the row that remains, so the pair is still legible.
  assert.deepEqual(submissionGrid(form.id)!.rows.find((r) => r.submissionId === first)!.duplicateOf, [twin]);
});

test("a correction cannot reach into another woman's record", async () => {
  const { createMember, getMember } = await import("@/app/lib/db");
  const { updateSubmissionAnswers } = await import("@/app/lib/forms/store");

  const { form } = await cohort("كلين");
  // A registration nobody has approved yet, so it has no member_id.
  const id = await register(form, { name: "ضيف", phone: "0545227720", city: "عرابة" });

  // Somebody else, already a منتسبة, with her own details.
  const other = createMember({ name: "منى صالح", phone: "+972545227721", city: "سخنين" })!;

  // Typing her number into the loose registration used to find her record
  // by the *new* phone and overwrite her name and town with the
  // registration's. The lookup now uses what the registration was before.
  const name = await answerFor(id, "name");
  const phone = await answerFor(id, "phone");
  updateSubmissionAnswers(
    id,
    [
      { answerId: phone.id, value: "0545227721" },
      { answerId: name.id, value: "اسم من تسجيل غريب" }
    ],
    { mayEditMember: true }
  );

  const untouched = getMember(other.id)!;
  assert.equal(untouched.name, "منى صالح", "her name is hers");
  assert.equal(untouched.city, "سخنين", "and so is her town");
});

test("without «تعديل البيانات» the registration is fixed and her record is not", async () => {
  const { getMember } = await import("@/app/lib/db");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { getSubmission, updateSubmissionAnswers } = await import("@/app/lib/forms/store");

  const { form } = await cohort("كلين");
  const id = await register(form, { name: "رنا", phone: "0545227722" });
  const approved = approveSubmission(id) as { ok: true; memberId: number };

  const name = await answerFor(id, "name");
  const result = updateSubmissionAnswers(id, [{ answerId: name.id, value: "رنا صالح" }]);

  assert.equal(result.memberBlocked, true, "and the caller is told");
  assert.deepEqual(result.reached, []);
  assert.equal(getSubmission(id)!.submission.name, "رنا صالح", "the registration is still corrected");
  assert.equal(getMember(approved.memberId)!.name, "رنا", "her record is untouched");
});
