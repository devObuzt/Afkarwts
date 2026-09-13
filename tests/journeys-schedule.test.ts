import test from "node:test";
import assert from "node:assert/strict";
import { stepDueAt } from "@/app/lib/journeys/schedule";

// 2026-08-30 is a Sunday, in Israel Daylight Time (UTC+3).
test("week 1 on the anchor's own weekday is the anchor day", () => {
  const due = stepDueAt("2026-08-30", { week: 1, weekday: 0, sendTime: "07:00" });
  assert.equal(due.toISOString(), "2026-08-30T04:00:00.000Z");
});

test("week 2 counts seven days on from the anchor's week", () => {
  const due = stepDueAt("2026-08-30", { week: 2, weekday: 2, sendTime: "19:30" });
  assert.equal(due.toISOString(), "2026-09-08T16:30:00.000Z");
});

test("a weekday before the anchor's falls later in the same week", () => {
  // The anchor is a Tuesday, so week 1's Sunday is the Sunday that follows it.
  const due = stepDueAt("2026-09-01", { week: 1, weekday: 0, sendTime: "07:00" });
  assert.equal(due.toISOString(), "2026-09-06T04:00:00.000Z");
});

test("07:00 stays 07:00 after daylight saving ends", () => {
  // Israel leaves daylight saving on 2026-10-25.
  const before = stepDueAt("2026-10-18", { week: 1, weekday: 0, sendTime: "07:00" });
  const after = stepDueAt("2026-10-18", { week: 3, weekday: 0, sendTime: "07:00" });

  assert.equal(before.toISOString(), "2026-10-18T04:00:00.000Z");
  assert.equal(after.toISOString(), "2026-11-01T05:00:00.000Z");
});
