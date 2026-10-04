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

test("a week is a calendar week, so week 1's Sunday is the Sunday of the anchor's week", () => {
  // The anchor is a Tuesday. Its week opened on Sunday 30 August — already
  // past, which the runner skips. The alternative, pushing that Sunday to the
  // one that follows, is what made a single path-week straddle two calendar
  // weeks.
  const due = stepDueAt("2026-09-01", { week: 1, weekday: 0, sendTime: "07:00" });
  assert.equal(due.toISOString(), "2026-08-30T04:00:00.000Z");
});

test("every day of one path week lands inside one calendar week", () => {
  // Afkar's live cohort: anchored Wednesday 30 September, with week 2 carrying
  // a step on all seven weekdays. It used to run Wed 7 → Tue 13 October, so
  // Sunday, Monday and Tuesday fell into the week after the others.
  const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) =>
    stepDueAt("2026-09-30", { week: 2, weekday, sendTime: "09:00" }).toISOString().slice(0, 10)
  );

  assert.deepEqual(days, [
    "2026-10-04",
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10"
  ]);
});

test("week 1 of that cohort still falls where it already fired", () => {
  // The Thursday step went out on 1 October; a change to the week rule must
  // not move a step that has already been sent.
  const due = stepDueAt("2026-09-30", { week: 1, weekday: 4, sendTime: "14:00" });
  assert.equal(due.toISOString().slice(0, 10), "2026-10-01");
});

test("07:00 stays 07:00 after daylight saving ends", () => {
  // Israel leaves daylight saving on 2026-10-25.
  const before = stepDueAt("2026-10-18", { week: 1, weekday: 0, sendTime: "07:00" });
  const after = stepDueAt("2026-10-18", { week: 3, weekday: 0, sendTime: "07:00" });

  assert.equal(before.toISOString(), "2026-10-18T04:00:00.000Z");
  assert.equal(after.toISOString(), "2026-11-01T05:00:00.000Z");
});
