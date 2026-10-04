import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

/** A two-question form: "any allergies?" and the follow-up that depends on it. */
async function allergyForm() {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, addField, listFields, updateField } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`شرطي ${seq}`);
  const form = createForm({ name: `شرطي ${seq}`, groupId: group.id });

  const gate = addField(form.id, {
    label: "هل لديك حساسية من أنواع أكل معينة؟",
    kind: "choice",
    required: true,
    options: ["نعم", "لا"]
  });
  const followUp = addField(form.id, {
    label: "من أي أنواع أكل؟",
    kind: "textarea",
    required: true
  });
  updateField(followUp.id, { showWhenFieldId: gate.id, showWhenValue: "نعم" });

  return { form, gate, followUp, fields: listFields(form.id) };
}

test("the follow-up is required when the gate says نعم", async () => {
  const { submitForm } = await import("@/app/lib/forms/store");
  const { form, gate, followUp } = await allergyForm();

  const result = submitForm(form.token, { [String(gate.id)]: "نعم", [String(followUp.id)]: "" });
  assert.equal(result.ok, false);
  assert.match((result as { error: string }).error, /من أي أنواع أكل/);
});

test("the follow-up is not required when the gate says لا", async () => {
  const { submitForm } = await import("@/app/lib/forms/store");
  const { form, gate, followUp } = await allergyForm();

  const result = submitForm(form.token, { [String(gate.id)]: "لا", [String(followUp.id)]: "" });
  assert.equal(result.ok, true, "a question nobody was shown cannot block the form");
});

test("a hidden question stores no answer, even if one is sent", async () => {
  const { submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form, gate, followUp } = await allergyForm();

  const result = submitForm(form.token, {
    [String(gate.id)]: "لا",
    [String(followUp.id)]: "سمك وبندورة"
  }) as { ok: true; id: number };

  const answers = getSubmission(result.id)!.answers;
  assert.equal(answers.length, 1, "only the question that was shown");
  assert.equal(answers[0].value, "لا");
});

test("the follow-up's answer is kept when the gate opened it", async () => {
  const { submitForm, getSubmission } = await import("@/app/lib/forms/store");
  const { form, gate, followUp } = await allergyForm();

  const result = submitForm(form.token, {
    [String(gate.id)]: "نعم",
    [String(followUp.id)]: "سمك وبندورة"
  }) as { ok: true; id: number };

  const answers = getSubmission(result.id)!.answers;
  assert.equal(answers.length, 2);
  assert.equal(answers[1].value, "سمك وبندورة");
});

test("an unanswered gate hides its follow-up rather than demanding it", async () => {
  const { submitForm } = await import("@/app/lib/forms/store");
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, addField, updateField } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`شرطي فاضي ${seq}`);
  const form = createForm({ name: `شرطي فاضي ${seq}`, groupId: group.id });
  const gate = addField(form.id, { label: "عندك حساسية؟", kind: "choice", required: false, options: ["نعم", "لا"] });
  const followUp = addField(form.id, { label: "شو بالضبط؟", kind: "textarea", required: true });
  updateField(followUp.id, { showWhenFieldId: gate.id, showWhenValue: "نعم" });

  assert.equal(submitForm(form.token, {}).ok, true);
});

test("the Clean template's follow-ups point at the right questions", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, listFields } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`قالب كلين ${seq}`);
  const form = createForm({ name: `قالب كلين ${seq}`, groupId: group.id, fromTemplate: true });
  const fields = listFields(form.id);

  const conditional = fields.filter((field) => field.showWhenFieldId);
  assert.equal(conditional.length, 2, "the medication and allergy follow-ups");

  for (const field of conditional) {
    const gate = fields.find((item) => item.id === field.showWhenFieldId)!;
    assert.notEqual(gate.id, field.id, "a question cannot be its own condition");
    assert.ok(gate.options.includes("نعم"), `the gate for «${field.label}» offers نعم`);
    assert.equal(field.showWhenValue, "نعم");
    assert.ok(fields.indexOf(gate) < fields.indexOf(field), "the gate is asked first");
  }
});

test("the title carries the current year rather than a typed one", async () => {
  const { renderTitle, CLEAN_TITLE } = await import("@/app/lib/forms/clean-template");
  assert.equal(renderTitle(CLEAN_TITLE, new Date("2027-01-15")), "CLEAN - اسبوع كلين تنظيف السموم 2027");
  assert.equal(renderTitle(CLEAN_TITLE, new Date("2026-12-31")), "CLEAN - اسبوع كلين تنظيف السموم 2026");
});

test("a condition on a pick-several question reads one ticked box, not the whole answer", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, addField, updateField, submitForm, getSubmission } = await import("@/app/lib/forms/store");
  seq += 1;
  const group = createGroup(`متعدد ${seq}`);
  const form = createForm({ name: `متعدد ${seq}`, groupId: group.id });

  const gate = addField(form.id, {
    label: "هل عانيت من أحد هذه الأمراض؟",
    kind: "multi",
    required: true,
    options: ["سكري", "آخر", "لا توجد لدي أمراض"]
  });
  const detail = addField(form.id, { label: "شو بالضبط؟", kind: "textarea", required: true });
  updateField(detail.id, { showWhenFieldId: gate.id, showWhenValue: "آخر" });

  // Several boxes ticked: the answer is a list, and «آخر» is one of them.
  const both = submitForm(form.token, {
    [String(gate.id)]: "سكري، آخر",
    [String(detail.id)]: "ضغط دم"
  }) as { ok: true; id: number };
  assert.equal(getSubmission(both.id)!.answers.length, 2, "the follow-up was asked and kept");

  // «آخر» not ticked: the follow-up is not asked, so it cannot block.
  const without = submitForm(form.token, { [String(gate.id)]: "سكري", [String(detail.id)]: "" });
  assert.equal(without.ok, true);
});
