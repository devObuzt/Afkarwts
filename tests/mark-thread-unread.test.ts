import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * «Treat it as if we never opened it.»
 *
 * Opening a conversation marks it read on the spot, and there was no way
 * back: a thread Afkar glanced at while busy left the unread list for
 * good. The header button undoes exactly that, for the whole thread, with
 * no message named — the screen should not have to decide which message
 * «the last thing she said» is.
 */
test("a thread goes back to unread from its last incoming message", async () => {
  const { createMember, createMessage, markMessageUnread, lastIncomingMessageId, markMemberMessagesRead, getDb } =
    await import("@/app/lib/db");
  const { listThreads } = await import("@/app/lib/inbox");

  const her = createMember({ name: "ايمان سرحان", phone: "+972527339936" })!;
  const quiet = createMember({ name: "ما كتبت", phone: "+972527339937" })!;

  const first = createMessage({ memberId: her.id, direction: "incoming", body: "مرحبا", status: "received" });
  createMessage({ memberId: her.id, direction: "outgoing", body: "أهلين", status: "sent" });
  const last = createMessage({ memberId: her.id, direction: "incoming", body: "عقبالك", status: "received" });

  // Opening the conversation is what marks it read.
  markMemberMessagesRead(her.id);
  assert.equal(listThreads().threads.find((t) => t.memberId === her.id)!.unread, 0);

  // The header button names no message: the thread's own last one is it.
  const target = lastIncomingMessageId(her.id);
  assert.equal(target, last.id, "her last word, not ours and not the first");

  const result = markMessageUnread(her.id, target!);
  assert.equal(result.ok, true);

  const thread = listThreads().threads.find((t) => t.memberId === her.id)!;
  assert.equal(thread.unread, 1, "back among the unread");
  assert.equal(
    (getDb().prepare("SELECT last_read_message_id AS id FROM members WHERE id = ?").get(her.id) as { id: number })
      .id,
    first.id,
    "read up to the message before hers — no flag of its own"
  );

  // And a conversation she never wrote in has nothing to reopen.
  assert.equal(lastIncomingMessageId(quiet.id), null);
});
