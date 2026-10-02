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

test("a new form starts from the Clean template and gets its own link", async () => {
  const { listFields } = await import("@/app/lib/forms/store");
  const { CLEAN_TEMPLATE } = await import("@/app/lib/forms/clean-template");
  const { form } = await cohort("كلين 18.10");

  assert.equal(form.status, "open");
  assert.match(form.token, /^[a-z0-9]{8,}$/);
  assert.equal(listFields(form.id).length, CLEAN_TEMPLATE.length);
  assert.equal(listFields(form.id)[0].mapsTo, "name", "the first question fills the member's name");
});

test("two forms never share a link", async () => {
  const a = await cohort("كلين 18.10");
  const b = await cohort("كلين 01.11");
  assert.notEqual(a.form.token, b.form.token);
});

test("an answer keeps the question it was answered against", async () => {
  const { listFields, recordSubmission, getSubmission, updateField } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين تسجيل");
  const fields = listFields(form.id);

  const id = recordSubmission(form.id, [{ fieldId: fields[0].id, value: "سارة عوض" }]);
  updateField(fields[0].id, { label: "الاسم الثلاثي" });

  const stored = getSubmission(id)!;
  assert.equal(stored.answers[0].label, "الاسم الكامل", "the old wording travels with the answer");
  assert.equal(stored.answers[0].value, "سارة عوض");
});

test("a removed question leaves its past answers readable", async () => {
  const { listFields, recordSubmission, getSubmission, archiveField } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين حذف");
  const fields = listFields(form.id);

  const id = recordSubmission(form.id, [{ fieldId: fields[0].id, value: "ورود" }]);
  archiveField(fields[0].id);

  assert.equal(
    listFields(form.id).some((item) => item.id === fields[0].id),
    false
  );
  assert.equal(getSubmission(id)!.answers.length, 1);
});

test("a question can be moved, and the order is what the form shows", async () => {
  const { listFields, moveField } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين ترتيب");
  const before = listFields(form.id).map((item) => item.label);

  moveField(listFields(form.id)[1].id, "up");

  const after = listFields(form.id).map((item) => item.label);
  assert.equal(after[0], before[1]);
  assert.equal(after[1], before[0]);
  assert.deepEqual(after.slice(2), before.slice(2), "nothing else moved");
});

test("a form can be opened and closed", async () => {
  const { setFormStatus, getForm } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين إغلاق");

  setFormStatus(form.id, "closed");
  assert.equal(getForm(form.id)!.status, "closed");

  setFormStatus(form.id, "open");
  assert.equal(getForm(form.id)!.status, "open");
});

test("a closed form still shows the registrations it already took", async () => {
  const { listFields, recordSubmission, setFormStatus, listSubmissions } = await import("@/app/lib/forms/store");
  const { form } = await cohort("كلين أرشيف");
  recordSubmission(form.id, [{ fieldId: listFields(form.id)[0].id, value: "أمون" }]);
  setFormStatus(form.id, "closed");

  assert.equal(listSubmissions({ formId: form.id }).length, 1);
});
