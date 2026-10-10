import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;
async function member(name: string) {
  const { createMember } = await import("@/app/lib/db");
  seq += 1;
  return createMember({ name, phone: `+97254${String(1000000 + seq * 7919).slice(0, 7)}` });
}

async function say(memberId: number, direction: "incoming" | "outgoing", body: string, at: string) {
  const { getDb } = await import("@/app/lib/db");
  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(memberId, direction, body, direction === "incoming" ? "received" : "sent", at);
}

test("the rail shows only threads that have been spoken in, unread first", async () => {
  const { listThreads } = await import("@/app/lib/inbox");

  const quiet = await member("ما حكينا معها");
  const older = await member("قديمة");
  const unread = await member("ردّت ولا حدا جاوب");

  await say(older.id, "outgoing", "رسالة قديمة", "2026-10-01 10:00:00");
  await say(unread.id, "incoming", "سؤال", "2026-09-20 10:00:00");

  const { threads, unreadTotal } = listThreads();
  const ids = threads.map((thread) => thread.memberId);

  assert.ok(!ids.includes(quiet.id), "a member with no messages is not a conversation");
  assert.equal(ids[0], unread.id, "unread comes first even though it is older");
  assert.equal(threads[0].unread, 1);
  assert.equal(unreadTotal, 1);
  assert.equal(threads[0].lastBody, "سؤال");
});

test("the rail says whether a free reply is still allowed", async () => {
  const { listThreads } = await import("@/app/lib/inbox");

  const fresh = await member("كتبت هلق");
  const stale = await member("كتبت من أسبوع");
  await say(fresh.id, "incoming", "مرحباً", new Date(Date.now() - 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19));
  await say(stale.id, "incoming", "مرحباً", new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19));

  const { threads } = listThreads();
  assert.equal(threads.find((t) => t.memberId === fresh.id)?.windowOpen, true);
  assert.equal(threads.find((t) => t.memberId === stale.id)?.windowOpen, false);
});

test("search finds a thread by name or by a locally typed phone", async () => {
  const { listThreads } = await import("@/app/lib/inbox");
  const { getDb } = await import("@/app/lib/db");

  const laila = await member("ليلى عوض");
  getDb().prepare("UPDATE members SET phone = '+972521234567' WHERE id = ?").run(laila.id);
  await say(laila.id, "outgoing", "مراحب", "2026-10-02 10:00:00");

  assert.ok(listThreads({ query: "ليلى" }).threads.some((t) => t.memberId === laila.id));
  assert.ok(
    listThreads({ query: "0521234567" }).threads.some((t) => t.memberId === laila.id),
    "typed with a leading zero, stored with +972"
  );
});
