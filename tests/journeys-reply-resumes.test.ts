import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";
delete process.env.WHATSAPP_WABA_ID;

/**
 * What went wrong with the Clean 18/10 cohort, as a test.
 *
 * Fifty-four of 252 women stopped receiving the path, twenty of them were
 * writing back while it stayed shut, and every step on the report read
 * «failed 0 · missed 0 · skipped 0 · stuck 0» — because a woman nobody
 * sent to leaves no row for any of those numbers to count.
 */
test("a reply after a stop puts her back, and the report shows who got nothing", async () => {
  const { createMember, createGroup, addMembersToGroup, listMessages, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { buildIncomingPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");
  const { stepBreakdown, whoOnStep } = await import("@/app/lib/journeys/report");
  const { listFollowups } = await import("@/app/lib/journeys/followups");

  const group = createGroup("كلين الردّ");
  const silent = createMember({ name: "سيرين", phone: "+972526800011", notes: "" })!;
  addMembersToGroup(group.id, [silent.id]);

  const template = createTemplate({ name: "كلين", smsText: "" });
  const step = (weekday: number, label: string) =>
    createStep({
      templateId: template.id,
      week: 1,
      weekday,
      sendTime: "07:00",
      label,
      freeText: "",
      templateName: "clean_week",
      templateLanguage: "ar",
      bodyParams: [],
      templatePreview: "مراحب"
    });
  const first = step(0, "أول").id;
  const second = step(3, "تاني").id;

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");

  // Day 0: the first step goes out. Its status never moves past accepted —
  // nothing says it reached her handset.
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));
  assert.equal(listMessages(silent.id).filter((m) => m.direction === "outgoing").length, 1);

  // 49 hours of that silence, and she leaves the path.
  await runDueJourneys(new Date("2026-09-01T06:00:00.000Z"));
  const stoppedState = getDb()
    .prepare("SELECT state, stop_reason FROM journey_enrollments WHERE journey_id = ?")
    .get(journey.id) as { state: string; stop_reason: string };
  assert.equal(stoppedState.state, "stopped");
  assert.equal(stoppedState.stop_reason, "not_delivered");
  assert.equal(listFollowups({ journeyId: journey.id }).filter((f) => f.state === "open").length, 1);

  // The second step's hour passes while she is out. This is the number that
  // was missing from the report: nobody sent it to her, and no bucket knew.
  const out = stepBreakdown(journey.id).find((row) => row.stepId === second)!;
  assert.equal(out.notSent, 1);
  assert.equal(out.failed, 0, "a message never attempted did not fail");
  assert.equal(out.missed, 0);
  assert.equal(out.sentText + out.sentTemplate, 0);

  const named = whoOnStep(journey.id, second, "not_sent");
  assert.deepEqual(
    named.map((row) => [row.name, row.detail]),
    [["سيرين", "not_delivered"]],
    "the count opens into her name, not a dead end"
  );

  // Then she writes. Nobody presses anything.
  await handleWebhookPayload(buildIncomingPayload({ phone: silent.phone, text: "موضلنيش اشي منك" }));
  await runDueJourneys(new Date("2026-09-02T05:30:00.000Z"));

  const back = getDb()
    .prepare("SELECT state FROM journey_enrollments WHERE journey_id = ?")
    .get(journey.id) as { state: string };
  assert.equal(back.state, "active", "her reply is the resume");
  assert.equal(
    listFollowups({ journeyId: journey.id }).filter((f) => f.state === "open").length,
    0,
    "the task to chase her is closed — she answered on her own"
  );

  const after = stepBreakdown(journey.id).find((row) => row.stepId === second)!;
  assert.equal(after.sentTemplate, 1, "the step she was owed actually went out");
  assert.equal(after.notSent, 0);
  assert.equal(stepBreakdown(journey.id).find((row) => row.stepId === first)!.sentTemplate, 1);
});
