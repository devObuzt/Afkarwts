import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";
delete process.env.WHATSAPP_WABA_ID;

test("the funnel counts each member once, by their best outcome", async () => {
  const { createMember, createGroup, addMembersToGroup, listMessages, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { buildIncomingPayload, buildStatusPayload, handleWebhookPayload } = await import(
    "@/app/lib/whatsapp-webhook"
  );
  const { journeyFunnel, stepBreakdown } = await import("@/app/lib/journeys/report");

  const group = createGroup("كلين تقرير");
  const reader = createMember({ name: "سارة", phone: "+972526800001", notes: "" })!;
  const unreachable = createMember({ name: "ليلى", phone: "+972526800002", notes: "" })!;
  addMembersToGroup(group.id, [reader.id, unreachable.id]);

  const template = createTemplate({ name: "كلين", smsText: "تواصلي معنا" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    label: "ترحيب",
    freeText: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");

  // The step falls due at 2026-08-30T04:00:00Z; both members are sent to.
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const readerMessage = listMessages(reader.id).find((message) => message.direction === "outgoing")!;
  await handleWebhookPayload(
    buildStatusPayload({ whatsappMessageId: readerMessage.whatsappMessageId!, status: "read" })
  );
  await handleWebhookPayload(buildIncomingPayload({ phone: reader.phone, text: "وصلتني" }));
  // SQLite stamps with the real clock; the reply belongs an hour after the send.
  getDb()
    .prepare("UPDATE messages SET created_at = ? WHERE member_id = ? AND direction = 'incoming'")
    .run("2026-08-30 06:00:00", reader.id);
  // The other message never reaches the handset, so its status stays accepted.

  // 49 hours later the unreached member leaves the path.
  await runDueJourneys(new Date("2026-09-01T06:00:00.000Z"));

  const funnel = journeyFunnel(journey.id);
  assert.equal(funnel.enrolled, 2);
  assert.equal(funnel.sent, 2);
  assert.equal(funnel.reached, 1);
  assert.equal(funnel.read, 1);
  assert.equal(funnel.replied, 1);
  assert.deepEqual(funnel.stopped, { not_delivered: 1 });
  assert.equal(funnel.manual.open, 1);

  const steps = stepBreakdown(journey.id);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].label, "ترحيب");
  assert.equal(steps[0].sentTemplate, 2);
  assert.equal(steps[0].sentText, 0);
  assert.equal(steps[0].read, 1);
  assert.equal(steps[0].replied, 1);
});
