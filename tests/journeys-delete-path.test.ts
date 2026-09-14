import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

const baseStep = {
  week: 1,
  weekday: 0,
  sendTime: "07:00",
  templateName: "clean_week",
  templateLanguage: "ar",
  bodyParams: [] as string[],
  templatePreview: ""
};

test("a path in use by a running journey is reported as in use", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus, liveJourneysUsingTemplate } = await import(
    "@/app/lib/journeys/store"
  );

  const group = createGroup("مجموعة حذف");
  const template = createTemplate({ name: "مسار قيد الاستعمال" });
  createStep({ ...baseStep, templateId: template.id });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });

  // A draft already counts: it is about to run.
  assert.equal(liveJourneysUsingTemplate(template.id).length, 1);

  setJourneyStatus(journey.id, "active");
  assert.deepEqual(
    liveJourneysUsingTemplate(template.id).map((item) => item.groupName),
    ["مجموعة حذف"]
  );

  // Once finished it no longer blocks removal.
  setJourneyStatus(journey.id, "done");
  assert.deepEqual(liveJourneysUsingTemplate(template.id), []);
});

test("an unused path reports nothing in use and archives away", async () => {
  const { createTemplate, archiveTemplate, listTemplates, liveJourneysUsingTemplate } = await import(
    "@/app/lib/journeys/store"
  );

  const template = createTemplate({ name: "مسار فاضي" });
  assert.deepEqual(liveJourneysUsingTemplate(template.id), []);

  archiveTemplate(template.id);
  assert.ok(!listTemplates().some((item) => item.id === template.id));
});
