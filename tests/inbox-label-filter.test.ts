import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * The rail is for working through one list at a time, and the label is
 * which list. Filtering on the membership row rather than on a name means
 * a renamed label keeps its conversations.
 */
test("the inbox can be narrowed to one label", async () => {
  const { createMember, createGroup, addMembersToGroup, createMessage, getDb } = await import("@/app/lib/db");
  const { listThreads } = await import("@/app/lib/inbox");

  const clean = createGroup("clean 15.11");
  const other = createGroup("internal testers");
  const inside = createMember({ name: "بالدفعة", phone: "+972526800501" })!;
  const outside = createMember({ name: "برّا", phone: "+972526800502" })!;
  addMembersToGroup(clean.id, [inside.id]);
  addMembersToGroup(other.id, [outside.id]);

  for (const member of [inside, outside]) {
    createMessage({ memberId: member.id, direction: "incoming", body: "مرحبا", status: "received" });
  }

  assert.equal(listThreads().threads.length, 2, "no label: everybody");
  assert.deepEqual(
    listThreads({ labelId: clean.id }).threads.map((thread) => thread.memberId),
    [inside.id]
  );
  assert.deepEqual(
    listThreads({ labelId: other.id }).threads.map((thread) => thread.memberId),
    [outside.id]
  );

  // A renamed label keeps its conversations — the filter is on the row.
  getDb().prepare("UPDATE groups SET name = ? WHERE id = ?").run("كلين تشرين", clean.id);
  assert.equal(listThreads({ labelId: clean.id }).threads.length, 1);

  // A label nobody is in is empty, not everybody.
  const empty = createGroup("ولا حدا");
  assert.equal(listThreads({ labelId: empty.id }).threads.length, 0);
});
