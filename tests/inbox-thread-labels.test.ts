import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * Each conversation carries its own labels, on its own row.
 *
 * Wisam: «كل محادثة الليبل تبعها، إذا فيش عليها ليبل لازم يكونش عليها
 * إشي». So an empty list stays empty — no placeholder, nothing to read
 * past — and the ones that have labels carry them beside the name.
 */
test("a conversation carries its labels, and an unlabelled one carries none", async () => {
  const { createMember, createGroup, addMembersToGroup, createMessage } = await import("@/app/lib/db");
  const { listThreads } = await import("@/app/lib/inbox");

  const batch = createGroup("clean 15.11");
  const state = createGroup("بانتظار أفكار");
  const labelled = createMember({ name: "عليها ملصقات", phone: "+972526800601" })!;
  const bare = createMember({ name: "بلا ملصق", phone: "+972526800602" })!;
  addMembersToGroup(batch.id, [labelled.id]);
  addMembersToGroup(state.id, [labelled.id]);

  for (const member of [labelled, bare]) {
    createMessage({ memberId: member.id, direction: "incoming", body: "مرحبا", status: "received" });
  }

  const threads = listThreads().threads;
  const withLabels = threads.find((thread) => thread.memberId === labelled.id)!;
  const without = threads.find((thread) => thread.memberId === bare.id)!;

  assert.deepEqual(
    withLabels.labels.map((label) => label.name).sort(),
    ["clean 15.11", "بانتظار أفكار"].sort(),
    "every list she is on, on her row"
  );
  assert.deepEqual(without.labels, [], "and nothing at all for somebody on none");

  // The id travels, so a chip can be coloured and later made clickable.
  assert.equal(
    withLabels.labels.every((label) => Number.isInteger(label.id) && label.id > 0),
    true
  );
});
