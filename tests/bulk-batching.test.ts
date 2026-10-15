import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The bulk screen walks a group in slices. What makes the server hand out
 * the *next* slice is the skip: each request re-reads the group and takes
 * the first few who have not had this message. Without it there is no
 * cursor at all, and looping would send to the same people again.
 */
const CLIENT = readFileSync(new URL("../app/InboxClient.tsx", import.meta.url), "utf8");
const ROUTE = readFileSync(new URL("../app/api/messages/bulk/route.ts", import.meta.url), "utf8");

test("the screen only loops when the skip gives it a cursor", () => {
  assert.ok(/const mayLoop = skipAlreadySent;/.test(CLIENT), "the loop is tied to the skip");
  assert.ok(/trip < \(mayLoop \? \d+ : 1\)/.test(CLIENT), "and without it there is exactly one trip");
});

test("a trip that accepted nobody stops the loop", () => {
  // Failures are no longer skipped, so a permanently unreachable number
  // comes back every trip. Without this the screen would retry it sixty
  // times over.
  assert.ok(/!mayLoop \|\| !running\.remaining \|\| budgetLeft <= 0 \|\| !payload\.sent/.test(CLIENT));
});

test("one request takes a slice it can finish", () => {
  // Each message is a round trip to Meta. The whole group in one request
  // was twenty minutes against a five-minute ceiling.
  const match = ROUTE.match(/const PER_REQUEST = (\d+);/);
  assert.ok(match, "a per-request cap exists");
  assert.ok(Number(match![1]) <= 300, `${match![1]} is too many for one request`);
  assert.ok(/Math\.min\(maxRecipients, PER_REQUEST\)/.test(ROUTE), "and it caps the batch");
  // The daily limit still governs the send as a whole.
  assert.ok(/limit\.dailyLimit/.test(ROUTE), "the daily ceiling is still applied");
});
