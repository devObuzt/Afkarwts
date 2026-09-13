import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

const baseStep = {
  templateName: "clean_week",
  templateLanguage: "ar",
  bodyParams: [] as string[],
  templatePreview: ""
};

test("a template keeps its steps in schedule order", async () => {
  const { createTemplate, createStep, listSteps } = await import("@/app/lib/journeys/store");

  const template = createTemplate({ name: "كلين" });
  createStep({ ...baseStep, templateId: template.id, week: 2, weekday: 2, sendTime: "19:30" });
  createStep({ ...baseStep, templateId: template.id, week: 1, weekday: 0, sendTime: "07:00" });

  assert.deepEqual(
    listSteps(template.id).map((step) => [step.week, step.weekday, step.sendTime]),
    [[1, 0, "07:00"], [2, 2, "19:30"]]
  );
});

test("body params survive the round trip as an array", async () => {
  const { createTemplate, createStep, listSteps } = await import("@/app/lib/journeys/store");

  const template = createTemplate({ name: "بارامترات" });
  createStep({ ...baseStep, templateId: template.id, week: 1, weekday: 0, sendTime: "07:00", bodyParams: ["{{name}}", "كلين"] });

  assert.deepEqual(listSteps(template.id)[0].bodyParams, ["{{name}}", "كلين"]);
});

test("an archived step disappears from the list but keeps its row", async () => {
  const { createTemplate, createStep, archiveStep, listSteps, getStep } = await import("@/app/lib/journeys/store");

  const template = createTemplate({ name: "أرشيف" });
  const step = createStep({ ...baseStep, templateId: template.id, week: 1, weekday: 0, sendTime: "07:00" });

  archiveStep(step.id);
  assert.equal(listSteps(template.id).length, 0);
  assert.equal(getStep(step.id)?.id, step.id);
});

test("a journey starts as a draft and can be activated", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { createTemplate, createJourney, getJourney, setJourneyStatus, listActiveJourneys } = await import(
    "@/app/lib/journeys/store"
  );

  const group = createGroup("كلين 999");
  const template = createTemplate({ name: "كلين" });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });

  assert.equal(getJourney(journey.id)?.status, "draft");
  assert.deepEqual(listActiveJourneys(), []);

  setJourneyStatus(journey.id, "active");
  assert.equal(getJourney(journey.id)?.status, "active");
  assert.deepEqual(listActiveJourneys().map((item) => item.id), [journey.id]);
});
