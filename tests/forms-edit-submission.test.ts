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
