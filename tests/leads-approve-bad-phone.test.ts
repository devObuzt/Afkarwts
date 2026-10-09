import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

/** A registration carrying whatever the person typed into the phone field. */
async function submission(phone: string) {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");

  seq += 1;
  const group = createGroup(`دفعة ${seq}-${Math.random().toString(36).slice(2, 6)}`);
  const form = createForm({ name: `تسجيل ${seq}`, groupId: group.id, fromTemplate: true });

  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name" ? "اسم تجربة" : field.mapsTo === "phone" ? phone : field.options[0] ?? "نعم";
  }

  return { group, form, result: submitForm(form.token, answers) };
}

test("a registration with too short a number is refused while the person can still fix it", async () => {
  // «+535353» is seven characters, and createMember refuses anything under
  // eight — on the live system that threw and the screen said «500».
  const { result } = await submission("535353");
  assert.equal(result.ok, false, "the form says so at the door");
  assert.ok(
    !result.ok && /رقم/.test(result.error),
    `and the message names the phone — got ${JSON.stringify(result)}`
  );
});

test("approving an unapprovable registration answers, rather than throwing", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { listSubmissions } = await import("@/app/lib/forms/store");

  // Rows already in the queue were taken before the door was closed, so the
  // approval path has to survive them too.
  const { form } = await submission("0521234567");
  const stored = listSubmissions({ formId: form.id })[0];
  getDb().prepare("UPDATE form_submissions SET phone = ? WHERE id = ?").run("+535353", stored.id);

  const result = approveSubmission(stored.id);
  assert.equal(result.ok, false, "an answer, not a 500");
  assert.ok(!result.ok && /رقم/.test(result.error), `readable — got ${JSON.stringify(result)}`);

  // And it stays in the queue rather than vanishing half-approved.
  assert.equal(listSubmissions({ formId: form.id })[0].state, "new");
});

test("a good number still goes through", async () => {
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { listSubmissions } = await import("@/app/lib/forms/store");

  const { form, result } = await submission("0529155582");
  assert.equal(result.ok, true);

  const stored = listSubmissions({ formId: form.id })[0];
  const approved = approveSubmission(stored.id);
  assert.equal(approved.ok, true, JSON.stringify(approved));
});
