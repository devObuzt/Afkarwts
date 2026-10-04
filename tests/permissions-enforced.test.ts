import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/** A member with a full registration behind her. */
async function registered() {
  const { createGroup } = await import("@/app/lib/db");
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { approveSubmission } = await import("@/app/lib/forms/approve");

  const group = createGroup(`دورة ${Date.now()}${Math.random()}`);
  const form = createForm({ name: `تسجيل ${Date.now()}`, groupId: group.id, fromTemplate: true });

  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? "ليلى عوض"
        : field.mapsTo === "phone"
          ? `05${Math.floor(10000000 + Math.random() * 80000000)}`
          : field.label.includes("أمراض")
            ? "سكري"
            : field.options.length
              ? field.options[0]
              : "نعم";
  }

  const submitted = submitForm(form.token, answers) as { ok: true; id: number };
  const approved = approveSubmission(submitted.id) as { ok: true; memberId: number };
  return approved.memberId;
}

test("without the health permission the illnesses are not in the record at all", async () => {
  const { getPersonRecord } = await import("@/app/lib/people");
  const memberId = await registered();

  const full = getPersonRecord(memberId)!;
  assert.ok(full.highlights.length > 0, "the coach sees what decides the programme");
  assert.ok(
    full.submissions[0].answers.some((answer) => answer.label.includes("أمراض")),
    "and the question is in her registration"
  );

  const limited = getPersonRecord(memberId, { health: false })!;
  assert.equal(limited.seesHealth, false);
  assert.deepEqual(limited.highlights, []);
  assert.ok(
    !limited.submissions[0].answers.some((answer) => answer.label.includes("أمراض")),
    "withheld where the record is built, not hidden in the markup"
  );
  assert.ok(
    !JSON.stringify(limited).includes("سكري"),
    "the answer itself is nowhere in what gets sent to the browser"
  );

  assert.equal(limited.member.name, "ليلى عوض", "she is still a contact you can work with");
  assert.ok(limited.submissions[0].answers.length > 0, "the rest of the registration is still readable");
});

test("an assistant does not hold the health permission, a coach does", async () => {
  const { can } = await import("@/app/lib/users/permissions");
  const { ROLE_PRESET } = await import("@/app/lib/users/permissions");

  const assistant = { role: "assistant", permissions: ROLE_PRESET.assistant };
  const coach = { role: "coach", permissions: ROLE_PRESET.coach };

  assert.equal(can(assistant, "people.health"), false);
  assert.equal(can(coach, "people.health"), true);
  assert.equal(can(assistant, "people.view"), true, "she still does her job");
  assert.equal(can(assistant, "journeys.manage"), false, "but does not start sends to hundreds of people");
  assert.equal(can(assistant, "people.delete"), false);
});

test("every permission is refused when nobody is signed in", async () => {
  const { can, PERMISSIONS } = await import("@/app/lib/users/permissions");
  for (const permission of PERMISSIONS) {
    assert.equal(can(null, permission), false, permission);
  }
});

test("what a user did is on the record", async () => {
  const { recordAction, listAudit } = await import("@/app/lib/users/audit");
  const { createUser } = await import("@/app/lib/users/store");

  const maryam = createUser({ name: "مريم", username: "maryam-log", password: "password-1", role: "assistant" });
  const afkar = createUser({ name: "أفكار", username: "afkar-log", password: "password-2", role: "owner" });
  assert.ok(maryam.ok && afkar.ok);
  const one = maryam.ok ? maryam.user.id : 0;
  const two = afkar.ok ? afkar.user.id : 0;

  recordAction({ userId: one, actor: "مريم", action: "message.send", subjectLabel: "ليلى عوض", detail: "مراحب" });
  recordAction({ userId: two, actor: "أفكار", action: "member.delete", subjectLabel: "+972500000000" });

  const all = listAudit();
  assert.equal(all[0].action, "member.delete", "newest first");
  assert.equal(all[0].actor, "أفكار");

  assert.deepEqual(listAudit({ userId: one }).map((entry) => entry.action), ["message.send"]);
  assert.deepEqual(listAudit({ action: "message.send" }).map((entry) => entry.actor), ["مريم"]);
});

test("a failed log write never fails the action it describes", async () => {
  const { recordAction } = await import("@/app/lib/users/audit");
  const { getDb } = await import("@/app/lib/db");

  getDb().exec("ALTER TABLE audit_log RENAME TO audit_log_hidden");
  // A lost log line is bad; a send that failed because of a lost log line
  // is worse.
  assert.doesNotThrow(() => recordAction({ userId: null, actor: "x", action: "message.send" }));
  getDb().exec("ALTER TABLE audit_log_hidden RENAME TO audit_log");
});
