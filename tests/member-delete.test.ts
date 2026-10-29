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

test("her files, labels and group places go — her payments only let go of her", async () => {
  const { deleteMember, createGroup, addMembersToGroup, getDb } = await import("@/app/lib/db");
  const { savePersonFile, listPersonFiles } = await import("@/app/lib/person-files");
  const person = await member("+972500000105");
  const group = createGroup(`محو كامل ${seq}`);
  addMembersToGroup(group.id, [person.id]);

  savePersonFile({
    memberId: person.id,
    kind: "plan",
    label: "خطة",
    originalName: "plan.txt",
    mimeType: "text/plain",
    bytes: new TextEncoder().encode("خطة الأسبوع")
  });
  getDb()
    .prepare("INSERT INTO label_refusals (member_id, group_id) VALUES (?, ?)")
    .run(person.id, group.id);
  getDb()
    .prepare(
      `INSERT INTO payments (morning_id, paid_on, amount, member_id, client_name)
       VALUES (?, '2026-10-01', 250, ?, 'محو')`
    )
    .run(`morning-${person.id}`, person.id);

  const { eraseMember } = await import("@/app/lib/members/erase");
  const result = eraseMember(person.id, "+972500000105") as { ok: true; files: number; payments: number };

  assert.equal(result.ok, true);
  assert.equal(result.files, 1);
  assert.equal(listPersonFiles(person.id).length, 0, "a file row left behind points at nobody");
  assert.equal(
    (getDb().prepare("SELECT COUNT(*) AS n FROM label_refusals WHERE member_id = ?").get(person.id) as { n: number })
      .n,
    0
  );

  // The books have to still add up after somebody is deleted.
  const payment = getDb()
    .prepare("SELECT member_id, amount FROM payments WHERE morning_id = ?")
    .get(`morning-${person.id}`) as { member_id: number | null; amount: number } | undefined;
  assert.ok(payment, "a payment is Afkar's record, not the contact's — it must survive");
  assert.equal(payment!.member_id, null, "but it must not point at a row that is gone");
  assert.equal(payment!.amount, 250);
});

test("a wrong number leaves even her files untouched", async () => {
  const { savePersonFile, listPersonFiles } = await import("@/app/lib/person-files");
  const { eraseMember } = await import("@/app/lib/members/erase");
  const person = await member("+972500000106");
  savePersonFile({
    memberId: person.id,
    kind: "doc",
    label: "ورقة",
    originalName: "x.txt",
    mimeType: "text/plain",
    bytes: new TextEncoder().encode("x")
  });

  const result = eraseMember(person.id, "+972500000999");

  assert.equal(result.ok, false);
  assert.equal(listPersonFiles(person.id).length, 1, "the files are checked against the number too, not after it");
});

/**
 * The same guard the merge has. A table added next year with a member_id,
 * and forgotten here, would leave rows pointing at a woman who was deleted.
 */
test("every table that names a member is accounted for when she is deleted", async () => {
  const { readFileSync } = await import("node:fs");
  const { getDb } = await import("@/app/lib/db");
  const db = getDb();

  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);

  const pointingAtMembers = tables.filter((table) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
      (column) => column.name === "member_id"
    )
  );

  const source = readFileSync(new URL("../app/lib/db.ts", import.meta.url), "utf8");
  const listed = (name: string) =>
    (source.match(new RegExp(`const ${name} = \\[([^\\]]+)\\]`))?.[1] ?? "")
      .split(",")
      .map((item) => item.trim().replace(/['"]/g, ""))
      .filter(Boolean);

  // journey_enrollments is deleted by its own statement; journey_sends hangs
  // off the enrolment rather than off her.
  const covered = new Set([
    ...listed("DELETE_WITH_MEMBER"),
    ...listed("DETACH_FROM_MEMBER"),
    ...listed("DELETED_BY_CALLER"),
    "journey_enrollments",
    "journey_sends"
  ]);

  const forgotten = pointingAtMembers.filter((table) => !covered.has(table));
  assert.deepEqual(forgotten, [], `these tables would be left pointing at a deleted member: ${forgotten.join(", ")}`);
});
