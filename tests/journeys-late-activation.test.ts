import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";
delete process.env.WHATSAPP_WABA_ID;

let seq = 0;

/** A cohort with one step due on the anchor day at 14:00 Jerusalem. */
async function cohort() {
  const { createGroup, createMember, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney } = await import("@/app/lib/journeys/store");
  seq += 1;

  const group = createGroup(`كلين ${seq}`);
  const early = createMember({ name: "سارة", phone: `+97252690${1000 + seq}`, notes: "" })!;
  addMembersToGroup(group.id, [early.id]);

  const template = createTemplate({ name: `كلين ${seq}`, smsText: "تواصلي معنا" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 4, // Thursday
    sendTime: "14:00",
    label: "ترحيب",
    freeText: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });

  // The week is the one that *contains* the anchor, Sunday to Saturday.
  // So a Thursday step before a cohort that starts Sunday 18/10 belongs to
  // the week anchored on 11/10 — anchoring on 18/10 puts it on 22/10,
  // four days after the cohort has already started.
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-10-11" });
  return { group, journey, early };
}

const sentTo = async (memberId: number) => {
  const { listMessages } = await import("@/app/lib/db");
  return listMessages(memberId).filter((m) => m.direction === "outgoing").length;
};

test("activating after the hour still sends, as long as it is within the window", async () => {
  const { setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { group, journey, early } = await cohort();

  // Due 2026-10-15 14:00 Jerusalem = 11:00Z. Switched on at 16:00 local.
  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-10-15T13:00:00.000Z"));

  assert.equal(await sentTo(early.id), 1, "two hours late is still inside the twelve-hour window");
  assert.ok(group.id > 0);
});

test("past the window it is never sent — not late, not at all", async () => {
  const { setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { journey, early } = await cohort();

  // 14:00 + 12h closes at 02:00 the next morning. This is 04:00.
  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-10-16T01:00:00.000Z"));

  assert.equal(await sentTo(early.id), 0, "the window had shut before anyone switched it on");
});

test("a woman added after the window shut is caught up, not written off", async () => {
  const { addMembersToGroup, createMember, getDb } = await import("@/app/lib/db");
  const { setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { group, journey, early } = await cohort();

  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-10-15T13:00:00.000Z"));
  assert.equal(await sentTo(early.id), 1, "the cohort got the welcome");

  // She registers the next morning — a day late, which is the whole
  // reason the question was asked.
  const late = createMember({ name: "ليلى", phone: `+97252691${1000 + seq}`, notes: "" })!;
  addMembersToGroup(group.id, [late.id]);
  await runDueJourneys(new Date("2026-10-16T07:00:00.000Z"));

  // One message behind is just sent: she is a day late, not lost. This
  // used to assert the opposite — the step was written off at the moment
  // she joined and nothing ever tried again.
  assert.equal(await sentTo(late.id), 1, "the welcome reaches her too");

  const states = (
    getDb()
      .prepare(
        `SELECT s.state FROM journey_sends s
           JOIN journey_enrollments e ON e.id = s.enrollment_id
          WHERE e.member_id = ? AND e.journey_id = ?`
      )
      .all(late.id, journey.id) as Array<{ state: string }>
  ).map((row) => row.state);
  assert.deepEqual(states, ["sent"], "and it is recorded as sent, not skipped");
});
