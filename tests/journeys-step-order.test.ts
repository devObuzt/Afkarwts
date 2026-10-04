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

  // Written out of order on purpose, and spanning two weeks so that sorting by
  // weekday alone would get it wrong.
  createStep({ ...base, week: 2, weekday: 0, sendTime: "07:00", label: "week2 sunday" });
  createStep({ ...base, week: 1, weekday: 4, sendTime: "07:00", label: "week1 thursday" });
  createStep({ ...base, week: 1, weekday: 2, sendTime: "07:00", label: "week1 tuesday" });

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-09-01" });
  const rows = stepBreakdown(journey.id);

  assert.deepEqual(
    rows.map((r) => r.label),
    ["week1 tuesday", "week1 thursday", "week2 sunday"]
  );

  // And the dates themselves must climb.
  const dates = rows.map((r) => new Date(r.dueAt).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b), "due dates ascend");
});
