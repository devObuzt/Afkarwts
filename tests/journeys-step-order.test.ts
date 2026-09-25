import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("the report lists steps in the order they actually fire", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney } = await import("@/app/lib/journeys/store");
  const { stepBreakdown } = await import("@/app/lib/journeys/report");

  const group = createGroup("ترتيب");
  const template = createTemplate({ name: "ترتيب" });
  const base = {
    templateId: template.id,
    templateName: "t",
    templateLanguage: "ar",
    bodyParams: [] as string[],
    templatePreview: ""
  };

  // Written out of order on purpose.
  createStep({ ...base, week: 1, weekday: 0, sendTime: "07:00", label: "sunday" });
  createStep({ ...base, week: 1, weekday: 2, sendTime: "07:00", label: "tuesday" });
  createStep({ ...base, week: 1, weekday: 4, sendTime: "07:00", label: "thursday" });

  // 2026-09-01 is a TUESDAY. Week 1 therefore runs Tue -> Mon, so the real
  // order is tuesday, thursday, sunday — not the weekday numbers 0,2,4.
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-09-01" });
  const rows = stepBreakdown(journey.id);

  assert.deepEqual(
    rows.map((r) => r.label),
    ["tuesday", "thursday", "sunday"]
  );

  // And the dates themselves must climb.
  const dates = rows.map((r) => new Date(r.dueAt).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b), "due dates ascend");
});
