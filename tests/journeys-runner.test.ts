import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";
// Left unset on purpose: with no WABA id, getMessagingLimit never calls Meta.
delete process.env.WHATSAPP_WABA_ID;

let seq = 0;

async function cohort() {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");

  seq += 1;
  const group = createGroup(`كلين ${seq}`);
  const member = createMember({ name: "سارة", phone: `+9725000${String(seq).padStart(5, "0")}`, notes: "" })!;
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: "كلين" });
  const step = createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    freeText: "مراحب يا رفاق",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });

  // 2026-08-30 is a Sunday, so week 1 Sunday 07:00 is 2026-08-30T04:00:00Z.
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  return { journey, member, step, group };
}

async function sendStates(journeyId: number) {
  const { getDb } = await import("@/app/lib/db");
  return getDb()
    .prepare(
      `SELECT s.state FROM journey_sends s
       JOIN journey_enrollments e ON e.id = s.enrollment_id
       WHERE e.journey_id = ?`
    )
    .all(journeyId) as Array<{ state: string }>;
}

async function outgoing(memberId: number) {
  const { listMessages } = await import("@/app/lib/db");
  return listMessages(memberId).filter((message) => message.direction === "outgoing");
}

test("a due step is sent once, however many ticks run", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { member, journey } = await cohort();

  const now = new Date("2026-08-30T05:00:00.000Z"); // an hour after 07:00 Israel time
  await runDueJourneys(now);
  await runDueJourneys(now);

  const messages = await outgoing(member.id);
  assert.equal(messages.length, 1);
  assert.match(messages[0].whatsappMessageId ?? "", /^dryrun\./);
  assert.deepEqual((await sendStates(journey.id)).map((row) => row.state), ["sent"]);
});

test("a member who joins after a step's time never receives it", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { member, journey } = await cohort();

  await runDueJourneys(new Date("2026-08-31T05:00:00.000Z")); // a day late

  assert.equal((await outgoing(member.id)).length, 0);
  assert.deepEqual((await sendStates(journey.id)).map((row) => row.state), ["skipped"]);
});

test("a step whose window closed while enrolled is recorded missed", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { member, journey } = await cohort();

  await runDueJourneys(new Date("2026-08-29T05:00:00.000Z")); // enrolled before the step
  await runDueJourneys(new Date("2026-08-31T05:00:00.000Z")); // back after the window shut

  assert.equal((await outgoing(member.id)).length, 0);
  assert.deepEqual((await sendStates(journey.id)).map((row) => row.state), ["missed"]);
});

test("free text is used when the member wrote inside the window", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { buildIncomingPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");
  const { getDb } = await import("@/app/lib/db");
  const { member } = await cohort();

  const now = new Date("2026-08-30T05:00:00.000Z");
  await handleWebhookPayload(buildIncomingPayload({ phone: member.phone, text: "جاهزة" }));
  // SQLite stamps the row with the real clock, so it is moved to half an hour
  // before the tick to put the reply inside the 24-hour window.
  getDb()
    .prepare("UPDATE messages SET created_at = ? WHERE member_id = ? AND direction = 'incoming'")
    .run("2026-08-30 04:30:00", member.id);

  await runDueJourneys(now);

  const messages = await outgoing(member.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, "مراحب يا رفاق");
});

test("a member who never wrote gets the template, not free text", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { member } = await cohort();

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const messages = await outgoing(member.id);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body, "مراحب"); // the template preview
});
