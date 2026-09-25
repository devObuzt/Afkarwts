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

async function cohort(phone: string) {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");

  seq += 1;
  const group = createGroup(`late ${seq}`);
  const member = createMember({ name: "دينا العمد", phone, notes: "" })!;
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: `late ${seq}`, smsText: "ما قدرنا نوصلك، تواصلي معنا" });
  const step = createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    label: "ترحيب",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب",
    smsText: "أهلا {{name}}، بلشنا أسبوع كلين"
  });

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  return { journey, member, step };
}

/** Meta accepts the send, then reports the failure later over the webhook. */
async function failLater(memberId: number) {
  const { listMessages } = await import("@/app/lib/db");
  const { buildStatusPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");
  const sent = listMessages(memberId).filter((m) => m.direction === "outgoing").at(-1)!;
  await handleWebhookPayload(
    buildStatusPayload({ whatsappMessageId: sent.whatsappMessageId!, status: "failed", error: "Message undeliverable" })
  );
}

async function enrollment(journeyId: number) {
  const { getDb } = await import("@/app/lib/db");
  return getDb()
    .prepare("SELECT state, stop_reason FROM journey_enrollments WHERE journey_id = ?")
    .get(journeyId) as { state: string; stop_reason: string | null };
}

test("a failure reported after the send still sends the step as SMS", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { journey, member, step } = await cohort("+972526800501");

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));
  assert.equal(listFollowups({ kind: "sms" }).filter((f) => f.memberId === member.id).length, 0, "nothing yet");

  await failLater(member.id);
  await runDueJourneys(new Date("2026-08-30T06:00:00.000Z"));

  const sms = listFollowups({ kind: "sms" }).filter((f) => f.memberId === member.id);
  assert.equal(sms.length, 1, "the late failure is answered like an immediate one");
  assert.equal(sms[0].body, "أهلا دينا، بلشنا أسبوع كلين");
  assert.equal(sms[0].stepId, step.id);
  assert.equal((await enrollment(journey.id)).state, "active");
});

test("a late failure on a number SMS cannot reach stops it there and then", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { journey, member } = await cohort("+970597240000");

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));
  await failLater(member.id);
  await runDueJourneys(new Date("2026-08-30T06:00:00.000Z"));

  const state = await enrollment(journey.id);
  assert.equal(state.state, "stopped", "not left waiting two days for a clock to run out");
  assert.equal(state.stop_reason, "send_failed");
  assert.equal(listFollowups({ kind: "manual" }).filter((f) => f.memberId === member.id).length, 1);
});

test("the report counts a late failure as a problem, before any tick reconciles it", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { stepBreakdown } = await import("@/app/lib/journeys/report");
  const { journey, member } = await cohort("+972526800502");

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));
  await failLater(member.id);

  // No second tick: the report must not wait for one to tell the truth.
  assert.equal(stepBreakdown(journey.id)[0].failed, 1);
});
