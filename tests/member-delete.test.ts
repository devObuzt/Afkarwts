import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function member(phone: string) {
  const { createMember } = await import("@/app/lib/db");
  seq += 1;
  return createMember({ name: `محو ${seq}`, phone, notes: "" })!;
}

test("deleting takes the member and everything hanging off them", async () => {
  const { deleteMember, getMember, createGroup, addMembersToGroup, listGroupMembers, getDb } = await import(
    "@/app/lib/db"
  );
  const person = await member("+972500000101");
  const group = createGroup(`محو ${seq}`);
  addMembersToGroup(group.id, [person.id]);
  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'outgoing', 'مراحب', 'sent')")
    .run(person.id);

  const result = deleteMember(person.id, "+972500000101");

  assert.equal(result.ok, true);
  assert.equal(getMember(person.id), null);
  assert.equal(listGroupMembers(group.id).length, 0);
  assert.equal(
    (getDb().prepare("SELECT COUNT(*) AS n FROM messages WHERE member_id = ?").get(person.id) as { n: number }).n,
    0
  );
});

test("the phone has to match, or nothing is deleted", async () => {
  const { deleteMember, getMember } = await import("@/app/lib/db");
  const person = await member("+972500000102");

  const result = deleteMember(person.id, "+972500000999");

  assert.equal(result.ok, false);
  assert.notEqual(getMember(person.id), null, "a wrong number must never delete somebody else");
});

test("the count of what went with them is reported back", async () => {
  const { deleteMember, getDb } = await import("@/app/lib/db");
  const person = await member("+972500000103");
  const insert = getDb().prepare(
    "INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'incoming', 'أهلا', 'received')"
  );
  insert.run(person.id);
  insert.run(person.id);

  const result = deleteMember(person.id, "+972500000103") as { ok: true; messages: number; name: string };
  assert.equal(result.messages, 2, "so the caller knows what a delete costs before repeating it");
});

test("deleting someone who is on a path clears their enrolment too", async () => {
  const { deleteMember, createGroup, addMembersToGroup, getDb } = await import("@/app/lib/db");
  const { createTemplate, createJourney } = await import("@/app/lib/journeys/store");
  const person = await member("+972500000104");
  const group = createGroup(`محو مسار ${seq}`);
  addMembersToGroup(group.id, [person.id]);
  const template = createTemplate({ name: `محو مسار ${seq}` });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  getDb()
    .prepare("INSERT INTO journey_enrollments (journey_id, member_id) VALUES (?, ?)")
    .run(journey.id, person.id);

  deleteMember(person.id, "+972500000104");

  assert.equal(
    (
      getDb().prepare("SELECT COUNT(*) AS n FROM journey_enrollments WHERE member_id = ?").get(person.id) as {
        n: number;
      }
    ).n,
    0
  );
});
