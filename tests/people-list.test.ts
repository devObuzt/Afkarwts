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
