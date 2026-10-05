import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;
function uniq() {
  seq += 1;
  return `${seq}-${Math.random().toString(36).slice(2, 7)}`;
}

async function member(name = "ليلى") {
  const { createMember } = await import("@/app/lib/db");
  return createMember({ name: `${name} ${uniq()}`, phone: `+9725${String(10000000 + seq * 7919).slice(0, 8)}` });
}

test("a person wears several labels at once, one per axis", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { setLabelKind, addLabel, labelsFor } = await import("@/app/lib/labels/store");

  const person = await member();
  const path = createGroup(`Extra+ ${uniq()}`);
  const batch = createGroup(`1.10 ${uniq()}`);
  const state = createGroup(`حامل ${uniq()}`);

  setLabelKind(path.id, "path");
  setLabelKind(batch.id, "batch");
  setLabelKind(state.id, "state");

  for (const label of [path, batch, state]) {
    addLabel(person.id, label.id);
  }

  // This is how هديل reads in Afkar's own chat list: متابعة مسار + EXTRA+ + 1.10.
  assert.deepEqual(
    labelsFor(person.id)
      .map((label) => label.kind)
      .sort(),
    ["batch", "path", "state"]
  );
});

test("«متابعة مسار» follows whoever is on a running path, by itself", async () => {
  const { createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus, syncEnrollments } = await import(
    "@/app/lib/journeys/store"
  );
  const { syncManagedStates, labelsFor, ensureManagedLabel } = await import("@/app/lib/labels/store");
  const { MANAGED_FOLLOWING } = await import("@/app/lib/labels/kinds");

  const person = await member("مريم");
  const idle = await member("ما دخلت مسار");
  const group = createGroup(`دفعة ${uniq()}`);
  addMembersToGroup(group.id, [person.id]);

  const template = createTemplate({ name: `كلين ${uniq()}` });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "08:00",
    label: "ترحيب",
    templateName: "clean_demo",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مرحباً"
  });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-10-04" });
  setJourneyStatus(journey.id, "active");
  syncEnrollments(journey.id, new Date("2026-10-04T05:00:00.000Z"));

  syncManagedStates();

  const following = ensureManagedLabel(MANAGED_FOLLOWING);
  assert.ok(labelsFor(person.id).some((label) => label.id === following.id), "on a running path");
  assert.ok(!labelsFor(idle.id).some((label) => label.id === following.id), "not on one");

  // When the path stops, the state goes with it.
  setJourneyStatus(journey.id, "done");
  syncManagedStates();
  assert.ok(!labelsFor(person.id).some((label) => label.id === following.id));
});

test("«بانتظار أفكار» is whoever wrote last", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { syncManagedStates, labelsFor, ensureManagedLabel } = await import("@/app/lib/labels/store");
  const { MANAGED_AWAITING } = await import("@/app/lib/labels/kinds");

  const person = await member("سارة");
  const db = getDb();
  db.prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'incoming', 'سؤال', 'received')").run(person.id);

  syncManagedStates();
  const awaiting = ensureManagedLabel(MANAGED_AWAITING);
  assert.ok(labelsFor(person.id).some((label) => label.id === awaiting.id));

  db.prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'outgoing', 'جواب', 'sent')").run(person.id);
  syncManagedStates();
  assert.ok(!labelsFor(person.id).some((label) => label.id === awaiting.id), "answered, so no longer waiting");
});

test("a hand-placed label is never taken off by the engine", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { syncManagedStates, labelsFor, ensureManagedLabel, addLabel } = await import("@/app/lib/labels/store");
  const { MANAGED_AWAITING } = await import("@/app/lib/labels/kinds");

  const person = await member("مثبّتة");
  const awaiting = ensureManagedLabel(MANAGED_AWAITING);

  // Afkar marks her as waiting although nothing in the data says so.
  addLabel(person.id, awaiting.id, true);
  syncManagedStates();

  const still = labelsFor(person.id).find((label) => label.id === awaiting.id);
  assert.ok(still, "«المنظومة لحالها + تعديل يدوي» means the hand wins");
  assert.equal(still?.pinned, true);

  // And the system may still add one it decides on, without pinning it.
  const other = await member("تلقائية");
  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'incoming', 'سؤال', 'received')")
    .run(other.id);
  syncManagedStates();
  assert.equal(labelsFor(other.id).find((label) => label.id === awaiting.id)?.pinned, false);
});

test("a managed label adopts the one Afkar already made, rather than duplicating it", async () => {
  const { createGroup, getDb } = await import("@/app/lib/db");
  const { ensureManagedLabel } = await import("@/app/lib/labels/store");

  getDb().exec("DELETE FROM groups WHERE managed = 'following'");
  getDb().exec("DELETE FROM groups WHERE name = 'متابعة مسار'");

  const theirs = createGroup("متابعة مسار");
  const managed = ensureManagedLabel("following");

  assert.equal(managed.id, theirs.id, "the same row, now marked as managed");
  assert.equal(managed.kind, "state");
  assert.equal(
    (getDb().prepare("SELECT COUNT(*) AS n FROM groups WHERE name = 'متابعة مسار'").get() as { n: number }).n,
    1
  );
});

test("a member is followed up by a user, and the link survives that user leaving", async () => {
  const { assignCoach, coachOf } = await import("@/app/lib/labels/store");
  const { createUser } = await import("@/app/lib/users/store");
  const { getDb } = await import("@/app/lib/db");

  const person = await member("منتسبة");
  const coach = createUser({ name: "جوانا", username: `jwana${uniq()}`.slice(0, 20), password: "coach-pass-1", role: "coach" });
  assert.ok(coach.ok);

  assert.equal(assignCoach(person.id, coach.ok ? coach.user.id : 0), true);
  assert.equal(coachOf(person.id)?.name, "جوانا");

  getDb().prepare("DELETE FROM users WHERE id = ?").run(coach.ok ? coach.user.id : 0);
  assert.equal(coachOf(person.id), null, "the member stays, the link clears");
});

test("what the record hands a screen is plain, not a database row", async () => {
  const { coachOf, assignCoach, labelsFor, addLabel } = await import("@/app/lib/labels/store");
  const { createUser } = await import("@/app/lib/users/store");
  const { createGroup } = await import("@/app/lib/db");

  const person = await member("بروتوتايب");
  const coach = createUser({ name: "مرافِقة", username: `c${uniq()}`.slice(0, 20), password: "coach-pass-2", role: "coach" });
  assignCoach(person.id, coach.ok ? coach.user.id : 0);
  addLabel(person.id, createGroup(`ملصق ${uniq()}`).id);

  // node:sqlite rows have a null prototype, and React refuses to send one
  // from a server component to a client component.
  for (const value of [coachOf(person.id), ...labelsFor(person.id)]) {
    assert.equal(Object.getPrototypeOf(value), Object.prototype, JSON.stringify(value));
  }
});

test("«بانتظار أفكار» lets go of a conversation nobody is waiting on", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { syncManagedStates, labelsFor, ensureManagedLabel, AWAITING_DAYS } = await import("@/app/lib/labels/store");
  const { MANAGED_AWAITING } = await import("@/app/lib/labels/kinds");

  const recent = await member("كتبت هالأسبوع");
  const ancient = await member("كتبت من زمان");
  const db = getDb();
  const now = new Date("2026-10-05T12:00:00.000Z");

  const stamp = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

  db.prepare(
    "INSERT INTO messages (member_id, direction, body, status, created_at) VALUES (?, 'incoming', 'سؤال', 'received', ?)"
  ).run(recent.id, stamp(2));
  db.prepare(
    "INSERT INTO messages (member_id, direction, body, status, created_at) VALUES (?, 'incoming', 'سؤال قديم', 'received', ?)"
  ).run(ancient.id, stamp(AWAITING_DAYS + 20));

  syncManagedStates(now);
  const awaiting = ensureManagedLabel(MANAGED_AWAITING);

  assert.ok(labelsFor(recent.id).some((label) => label.id === awaiting.id), "this week's question is still open");
  assert.ok(
    !labelsFor(ancient.id).some((label) => label.id === awaiting.id),
    "a message from months ago is not a task — 45 of 57 on the live database were that"
  );
});
