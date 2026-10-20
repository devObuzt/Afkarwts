import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("people are searched by name, by town and by a phone typed the local way", async () => {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { listPeople } = await import("@/app/lib/people");

  const group = createGroup("كلين 18.10");
  const laila = createMember({ name: "ليلى عوض", phone: "+972521234567", city: "عرابة" });
  createMember({ name: "مريم حسارمة", phone: "+972528889999", city: "سخنين" });
  addMembersToGroup(group.id, [laila.id]);

  assert.deepEqual(listPeople({ query: "ليلى" }).people.map((p) => p.id), [laila.id]);
  assert.deepEqual(listPeople({ query: "سخنين" }).people.map((p) => p.name), ["مريم حسارمة"]);
  assert.deepEqual(
    listPeople({ query: "0521234567" }).people.map((p) => p.id),
    [laila.id],
    "typed with a leading zero, stored with +972"
  );
  assert.deepEqual(listPeople({ groupId: group.id }).people.map((p) => p.id), [laila.id]);
  assert.equal(listPeople({ query: "ليلى" }).people[0].groups[0], "كلين 18.10");
});

test("the list pages, because it grows by a cohort every month", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { listPeople } = await import("@/app/lib/people");

  for (let index = 0; index < 8; index += 1) {
    createMember({ name: `صفّ ${index}`, phone: `+97253000000${index}` });
  }

  const first = listPeople({ query: "صفّ", limit: 5 });
  assert.equal(first.people.length, 5);
  assert.equal(first.total, 8, "the count is of everyone matching, not of the page");
  assert.equal(listPeople({ query: "صفّ", limit: 5, offset: 5 }).people.length, 3);
});

test("an unread reply is counted on the row", async () => {
  const { createMember, getDb, markMemberMessagesRead } = await import("@/app/lib/db");
  const { listPeople } = await import("@/app/lib/people");

  const member = createMember({ name: "سارة قارئة", phone: "+972545555555" });
  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'incoming', 'مراحب', 'received')")
    .run(member.id);

  assert.equal(listPeople({ query: "سارة قارئة" }).people[0].unread, 1);
  markMemberMessagesRead(member.id);
  assert.equal(listPeople({ query: "سارة قارئة" }).people[0].unread, 0);
});

/**
 * Whoever is waiting on an answer is at the top.
 *
 * The list used to sort by the last message alone, so a woman who wrote
 * two days ago sat under every thread we had already read — and marking a
 * message unread, which exists precisely to put her back in the queue,
 * changed nothing you could see on this screen.
 */
test("unread threads come first, and among them the newest message", async () => {
  const { createMember, createMessage, markMessageUnread, getDb } = await import("@/app/lib/db");
  const { listPeople } = await import("@/app/lib/people");

  const waited = createMember({ name: "مستنية من امبارح", phone: "+972521110001" });
  const answered = createMember({ name: "ردّينا عليها اليوم", phone: "+972521110002" });
  const alsoWaiting = createMember({ name: "مستنية من اليوم", phone: "+972521110003" });

  const say = (memberId: number, at: string) => {
    const message = createMessage({
      memberId,
      direction: "incoming",
      body: "مرحبا",
      status: "received"
    });
    getDb().prepare("UPDATE messages SET created_at = ? WHERE id = ?").run(at, message.id);
    return message.id;
  };

  const old = say(waited.id, "2026-10-17 09:00:00");
  say(alsoWaiting.id, "2026-10-19 09:00:00");
  const seen = say(answered.id, "2026-10-19 18:00:00");
  // Read: her thread drops below the two still waiting, however recent.
  getDb().prepare("UPDATE members SET last_read_message_id = ? WHERE id = ?").run(seen, answered.id);

  // Only these three: the file shares one database, so the list also holds
  // whoever the other tests made.
  const mine = new Set([waited.id, answered.id, alsoWaiting.id]);
  const order = () =>
    listPeople({ limit: 200 })
      .people.filter((p) => mine.has(p.id))
      .map((p) => p.name);

  assert.deepEqual(order(), ["مستنية من اليوم", "مستنية من امبارح", "ردّينا عليها اليوم"]);

  // And marking a read message unread puts that thread straight back up.
  getDb().prepare("UPDATE members SET last_read_message_id = ? WHERE id = ?").run(old, waited.id);
  assert.deepEqual(order(), ["مستنية من اليوم", "ردّينا عليها اليوم", "مستنية من امبارح"], "she is read now");

  markMessageUnread(answered.id, seen);
  assert.deepEqual(
    order(),
    ["ردّينا عليها اليوم", "مستنية من اليوم", "مستنية من امبارح"],
    "marking it unread puts her back on top — hers is the newest unread"
  );
});
