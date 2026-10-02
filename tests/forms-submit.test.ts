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

/** Every required question answered, so a test can vary just the one it cares about. */
async function filled(formId: number, overrides: Record<string, string> = {}) {
  const { listFields } = await import("@/app/lib/forms/store");
  const answers: Record<string, string> = {};

  for (const field of listFields(formId)) {
    const override = overrides[field.mapsTo || field.label];
    if (override !== undefined) {
      answers[String(field.id)] = override;
      continue;
    }
    answers[String(field.id)] =
      field.kind === "date"
        ? "2026-10-02"
        : field.kind === "phone"
          ? "0501234567"
          : field.options.length
            ? field.options[0]
            : "نعم";
  }

  return answers;
}

test("a required question left empty is refused, and the refusal names it", async () => {
  const { listFields, submitForm } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين إلزامي");
  const fields = listFields(form.id);

  const answers = await filled(form.id);
  answers[String(fields[0].id)] = "   ";

  const result = submitForm(form.token, answers);
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /الاسم الكامل/);
});

test("an optional question left empty is fine", async () => {
  const { submitForm } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين اختياري");

  const answers = await filled(form.id, { "رقم الهوية": "" });
  assert.equal(submitForm(form.token, answers).ok, true);
});

test("a closed form accepts nothing", async () => {
  const { submitForm, setFormStatus } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين مسكّر");
  setFormStatus(form.id, "closed");

  const result = submitForm(form.token, await filled(form.id));
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /انتهى التسجيل/);
});

test("an unknown link accepts nothing", async () => {
  const { submitForm } = await import("@/app/lib/forms/store");
  assert.equal(submitForm("nosuchtoken", {}).ok, false);
});

test("an answer to a question this form does not have is ignored", async () => {
  const { submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين دخيل");

  const answers = await filled(form.id);
  answers["999999"] = "حقل مش موجود";

  const result = submitForm(form.token, answers) as { ok: true; id: number };
  assert.equal(result.ok, true);
  assert.equal(
    getSubmission(result.id)!.answers.some((answer) => answer.value === "حقل مش موجود"),
    false
  );
});

test("the phone is stored in one shape, however it was typed", async () => {
  const { submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين تلفون");

  const result = submitForm(form.token, await filled(form.id, { phone: "054-522-7674" })) as {
    ok: true;
    id: number;
  };
  assert.equal(getSubmission(result.id)!.submission.phone, "+972545227674");
});

test("the name and city travel onto the submission, ready for approval", async () => {
  const { submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين ربط");

  const result = submitForm(
    form.token,
    await filled(form.id, { name: "سارة عوض", city: "مجد الكروم - الحارة الشرقية" })
  ) as { ok: true; id: number };

  const stored = getSubmission(result.id)!.submission;
  assert.equal(stored.name, "سارة عوض");
  assert.equal(stored.city, "مجد الكروم - الحارة الشرقية");
  assert.equal(stored.state, "new");
});
