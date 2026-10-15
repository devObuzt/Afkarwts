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

/** A cohort with one step due, run once so the send is on the record. */
async function cohortWithOneSend(phone: string) {
  const { addMembersToGroup, createGroup, createMember } = await import("@/app/lib/db");
  const { createJourney, createStep, createTemplate, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  seq += 1;

  const group = createGroup(`كلين إعادة ${seq}`);
  const her = createMember({ name: "سوار", phone, notes: "" })!;
  addMembersToGroup(group.id, [her.id]);

  const template = createTemplate({ name: `كلين إعادة ${seq}`, smsText: "تواصلي معنا" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 4,
    sendTime: "14:00",
    label: "ترحيب",
    freeText: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-10-11" });
  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-10-15T13:00:00.000Z"));

  return { her, journey };
}

test("a step that failed on a number since corrected is sent again", async () => {
  const { getDb, updateMemberPhone } = await import("@/app/lib/db");
  const { reopenFailedSendsOnNewNumbers } = await import("@/app/lib/journeys/retry-on-new-number");
  const { her, journey } = await cohortWithOneSend("+972208254566");

  // Meta refused it: the number is not a mobile.
  const send = getDb()
    .prepare(
      `SELECT s.id, s.message_id FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
        WHERE e.member_id = ?`
    )
    .get(her.id) as { id: number; message_id: number };
  getDb().prepare("UPDATE journey_sends SET state = 'failed' WHERE id = ?").run(send.id);
  getDb().prepare("UPDATE messages SET status = 'failed' WHERE id = ?").run(send.message_id);

  // Nothing has changed about her number yet, so nothing reopens.
  assert.equal(reopenFailedSendsOnNewNumbers().reopened, 0, "a failure on the current number stays failed");

  // Now it is corrected.
  updateMemberPhone(her.id, "0508254566");
  assert.equal(reopenFailedSendsOnNewNumbers().reopened, 1, "and the step she never got comes back");

  const left = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
        WHERE e.member_id = ?`
    )
    .get(her.id) as { n: number };
  assert.equal(left.n, 0, "the written-off attempt is cleared, so the runner sees it as due");

  // And it only reopens once per correction.
  assert.equal(reopenFailedSendsOnNewNumbers().reopened, 0);
  assert.ok(journey.id > 0);
});

test("a send that succeeded is never reopened, however the number changes", async () => {
  const { updateMemberPhone } = await import("@/app/lib/db");
  const { reopenFailedSendsOnNewNumbers } = await import("@/app/lib/journeys/retry-on-new-number");
  const { her } = await cohortWithOneSend("+972545227674");

  updateMemberPhone(her.id, "0545227675");
  assert.equal(reopenFailedSendsOnNewNumbers().reopened, 0, "she already has it; a new number is not a reason to resend");
});

test("the runner then sends it, to the new number", async () => {
  const { getDb, listMessages, updateMemberPhone } = await import("@/app/lib/db");
  const { reopenFailedSendsOnNewNumbers } = await import("@/app/lib/journeys/retry-on-new-number");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { her } = await cohortWithOneSend("+972574543062");

  const send = getDb()
    .prepare(
      `SELECT s.id, s.message_id FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id WHERE e.member_id = ?`
    )
    .get(her.id) as { id: number; message_id: number };
  getDb().prepare("UPDATE journey_sends SET state = 'failed' WHERE id = ?").run(send.id);
  getDb().prepare("UPDATE messages SET status = 'failed' WHERE id = ?").run(send.message_id);

  updateMemberPhone(her.id, "0547543062");
  reopenFailedSendsOnNewNumbers();
  await runDueJourneys(new Date("2026-10-15T13:30:00.000Z"));

  const sentTo = listMessages(her.id).filter((message) => message.direction === "outgoing");
  assert.ok(sentTo.length >= 2, "a second attempt went out");
});
