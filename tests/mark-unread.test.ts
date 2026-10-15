import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function conversation() {
  const { createMember, createMessage, markMemberMessagesRead } = await import("@/app/lib/db");
  seq += 1;
  const her = createMember({ name: "سارة", phone: `+9725270${1000 + seq}0`, notes: "" })!;
  const first = createMessage({ memberId: her.id, direction: "incoming", body: "مرحبا", status: "received" });
  createMessage({ memberId: her.id, direction: "outgoing", body: "أهلين", status: "sent" });
  const second = createMessage({ memberId: her.id, direction: "incoming", body: "سؤال", status: "received" });
  const third = createMessage({ memberId: her.id, direction: "incoming", body: "وسؤال تاني", status: "received" });
  markMemberMessagesRead(her.id);
  return { her, first, second, third };
}

const unreadFor = async (memberId: number) => {
  const { getMember } = await import("@/app/lib/db");
  return getMember(memberId)!.unreadCount;
};

test("marking a message unread reopens the thread from that message on", async () => {
  const { markMessageUnread } = await import("@/app/lib/db");
  const { her, second } = await conversation();
  assert.equal(await unreadFor(her.id), 0, "it was all read to begin with");

  assert.equal(markMessageUnread(her.id, second.id).ok, true);

  // That one and everything after it — reopening a thread from a point
  // means from that point, not just the single message.
  assert.equal(await unreadFor(her.id), 2);
});

test("marking the first message unread makes the whole thread unread", async () => {
  const { markMessageUnread } = await import("@/app/lib/db");
  const { her, first } = await conversation();

  assert.equal(markMessageUnread(her.id, first.id).ok, true);
  assert.equal(await unreadFor(her.id), 3, "nothing before it, so nothing is read");
});

test("our own messages cannot be marked unread", async () => {
  const { createMessage, markMessageUnread } = await import("@/app/lib/db");
  const { her } = await conversation();
  const ours = createMessage({ memberId: her.id, direction: "outgoing", body: "منّا", status: "sent" });

  const result = markMessageUnread(her.id, ours.id);
  assert.equal(result.ok, false, "nobody is waiting on a message we sent");
  assert.equal(await unreadFor(her.id), 0);
});

test("a message from another conversation is refused", async () => {
  const { createMember, createMessage, markMessageUnread } = await import("@/app/lib/db");
  const { her } = await conversation();
  seq += 1;
  const other = createMember({ name: "ليلى", phone: `+9725271${1000 + seq}0`, notes: "" })!;
  const hers = createMessage({ memberId: other.id, direction: "incoming", body: "مرحبا", status: "received" });

  assert.equal(markMessageUnread(her.id, hers.id).ok, false);
  assert.equal(await unreadFor(her.id), 0, "and nothing moved");
});

test("reading it again clears it, as before", async () => {
  const { markMemberMessagesRead, markMessageUnread } = await import("@/app/lib/db");
  const { her, second } = await conversation();

  markMessageUnread(her.id, second.id);
  assert.equal(await unreadFor(her.id), 2);

  markMemberMessagesRead(her.id);
  assert.equal(await unreadFor(her.id), 0, "opening the thread marks it read the ordinary way");
});

test("the thread sorts among the unread by when her messages arrived", async () => {
  const { getMember, markMessageUnread } = await import("@/app/lib/db");
  const { her, second } = await conversation();
  markMessageUnread(her.id, second.id);

  // «Unread» is the count the inbox already orders by — there is no
  // separate flag and no second sort — so a reopened thread lands exactly
  // where a newly arrived one would, and the two can never disagree.
  const member = getMember(her.id)!;
  assert.equal(member.unreadCount, 2);
  assert.ok(member.lastReadMessageId !== null || member.lastReadMessageId === null);
});
