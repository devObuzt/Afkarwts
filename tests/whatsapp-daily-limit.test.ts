import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// Its own file: getMessagingLimit caches for an hour, so a second test in
// the same process would read the first one's answer.
process.env.WHATSAPP_DAILY_LIMIT = "10000";
delete process.env.WHATSAPP_WABA_ID;

test("the stated daily limit wins over the tier Meta reports", async () => {
  // Meta's tier field goes stale: it kept reading the old number long
  // after the account was raised, and the bulk screen then capped a
  // 4,000-person send at the stale figure.
  const { getMessagingLimit } = await import("@/app/lib/whatsapp");
  process.env.WHATSAPP_DAILY_LIMIT = "10000";
  delete process.env.WHATSAPP_WABA_ID;

  const limit = await getMessagingLimit();
  assert.equal(limit.dailyLimit, 10000, "what the account actually has");
  assert.equal(limit.suggested, 7000, "and the suggested batch is 70% of it");
});
