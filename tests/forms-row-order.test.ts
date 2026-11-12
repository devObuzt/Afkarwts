import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

async function threeRows() {
  const { createForm, listFields, listSubmissions, submitForm } = await import("@/app/lib/forms/store");
  const { createGroup } = await import("@/app/lib/db");

  const group = createGroup(`ترتيب ${Math.random()}`);
  const form = createForm({ name: "ترتيب", groupId: group.id, fromTemplate: true });
  const fields = listFields(form.id);

  for (const [index, name] of ["وحدة", "تنتين", "تلاتة"].entries()) {
    const values: Record<string, string> = {};
    for (const field of fields) {
      if (field.label.includes("الاسم الكامل")) values[String(field.id)] = name;
      else if (field.label.includes("رقم الهاتف")) values[String(field.id)] = `05011122${index}${index}`;
      else if (!field.required) continue;
      else if (field.options.length) values[String(field.id)] = field.options[field.options.length - 1];
      else values[String(field.id)] = "—";
    }
    const sent = submitForm(form.token, values, { requirePhoneCode: false });
    assert.equal(sent.ok, true, sent.ok ? "" : sent.error);
  }

  return { form, names: () => listSubmissions({ formId: form.id }).map((row) => row.name) };
}

test("السحب بيحفظ الترتيب، والقراءة بترجعه", async () => {
  const { setSubmissionOrder } = await import("@/app/lib/forms/store");
  const { listSubmissions } = await import("@/app/lib/forms/store");
  const { form, names } = await threeRows();

  const ids = listSubmissions({ formId: form.id }).map((row) => row.id);
  setSubmissionOrder(form.id, [ids[2], ids[0], ids[1]]);

  assert.deepEqual(
    listSubmissions({ formId: form.id }).map((row) => row.id),
    [ids[2], ids[0], ids[1]]
  );
  assert.equal(names().length, 3);
});

test("معرّف من استمارة تانية بينتجاهل، والمكرّر مرة وحدة", async () => {
  const { setSubmissionOrder, listSubmissions } = await import("@/app/lib/forms/store");
  const a = await threeRows();
  const b = await threeRows();

  const mine = listSubmissions({ formId: a.form.id }).map((row) => row.id);
  const theirs = listSubmissions({ formId: b.form.id }).map((row) => row.id);

  const result = setSubmissionOrder(a.form.id, [theirs[0], mine[1], mine[1], mine[0], mine[2]]);
  assert.equal(result.ordered, 3);
  assert.deepEqual(
    listSubmissions({ formId: a.form.id }).map((row) => row.id),
    [mine[1], mine[0], mine[2]]
  );
  // واستمارة الجار ما انلمست.
  assert.deepEqual(listSubmissions({ formId: b.form.id }).map((row) => row.id), theirs);
});

test("التسجيل الجديد بينزل بآخر قائمة مرتّبة بالإيد", async () => {
  const { setSubmissionOrder, listSubmissions, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { form } = await threeRows();

  const ids = listSubmissions({ formId: form.id }).map((row) => row.id);
  setSubmissionOrder(form.id, ids);

  const values: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    if (field.label.includes("الاسم الكامل")) values[String(field.id)] = "جديدة";
    else if (field.label.includes("رقم الهاتف")) values[String(field.id)] = "0509998877";
    else if (!field.required) continue;
    else if (field.options.length) values[String(field.id)] = field.options[field.options.length - 1];
    else values[String(field.id)] = "—";
  }
  const sent = submitForm(form.token, values, { requirePhoneCode: false });
  assert.equal(sent.ok, true);

  const after = listSubmissions({ formId: form.id });
  assert.equal(after[after.length - 1].name, "جديدة");
});
