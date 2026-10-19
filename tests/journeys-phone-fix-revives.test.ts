import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// No credentials on purpose: every WhatsApp send fails, which is the state
// a wrong number leaves behind.
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;
delete process.env.WHATSAPP_WABA_ID;

/**
 * Sawar Faour, as a test.
 *
 * Her number was typed «0208254566» on 15.10.2026. The step failed, the
 * path stopped her for send_failed, and the task read «رقم غير إسرائيلي،
 * لا يدخل طابور الـSMS» — true of that number, and never asked again.
 * Ten minutes later the number was corrected to an ordinary Israeli
 * mobile and nothing went back to look: no SMS, no path, four days of the
 * course running without her.
 */
test("correcting a number asks again for everything the old one was refused", async () => {
  const { createMember, createGroup, addMembersToGroup, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { reviveAfterPhoneFix } = await import("@/app/lib/journeys/phone-fix");
  const { updateMemberPhone } = await import("@/app/lib/db");

  const group = createGroup("كلين الرقم الغلط");
  // 02 is a landline prefix, so the SMS queue refuses it — as it should.
  const member = createMember({ name: "سوار", phone: "+972208254566", notes: "" })!;
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: "كلين", smsText: "حاولنا نوصلك وما نجحنا" });
  const steps = [0, 1, 2].map((weekday) =>
    createStep({
      templateId: template.id,
      week: 1,
      weekday,
      sendTime: "07:00",
      label: `خطوة ${weekday}`,
      freeText: "",
      templateName: "clean_week",
      templateLanguage: "ar",
      bodyParams: [],
      templatePreview: "مراحب",
      smsText: "أهلا {{name}}، بلشنا أسبوع كلين"
    }).id
  );

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const enrollment = getDb()
    .prepare("SELECT id, state, stop_reason FROM journey_enrollments WHERE journey_id = ?")
    .get(journey.id) as { id: number; state: string; stop_reason: string };
  assert.equal(enrollment.state, "stopped");
  assert.equal(enrollment.stop_reason, "send_failed");
  assert.equal(
    listFollowups({ kind: "sms" }).filter((f) => f.memberId === member.id).length,
    0,
    "no SMS: 02 is not a mobile, and that refusal was right"
  );
  assert.match(
    listFollowups({ kind: "manual" }).find((f) => f.memberId === member.id)!.reason,
    /لا يدخل طابور/,
    "the task says why"
  );

  // Two more steps fire while she is out.
  await runDueJourneys(new Date("2026-08-31T05:00:00.000Z"));
  await runDueJourneys(new Date("2026-09-01T05:00:00.000Z"));

  // Then somebody corrects the number.
  updateMemberPhone(member.id, "+972508254566");
  const revived = reviveAfterPhoneFix(member.id, new Date("2026-09-01T06:00:00.000Z"));

  assert.equal(revived.resumed, 1, "the path she was stopped on is open again");
  assert.equal(revived.owed, 1, "the oldest gap now; the rest one a minute");
  assert.equal(revived.sms, 1, "and the SMS the old number could not take");

  const back = getDb()
    .prepare("SELECT state, stop_reason FROM journey_enrollments WHERE id = ?")
    .get(enrollment.id) as { state: string; stop_reason: string | null };
  assert.equal(back.state, "active");
  assert.equal(back.stop_reason, null);
  assert.equal(
    listFollowups({ kind: "manual" }).filter((f) => f.memberId === member.id && f.state === "open").length,
    0,
    "nobody has to chase a number that is already fixed"
  );

  const sms = listFollowups({ kind: "sms" }).filter((f) => f.memberId === member.id);
  assert.equal(sms.length, 1);
  assert.equal(sms[0].body, "أهلا سوار، بلشنا أسبوع كلين", "the step's own text, with her name");
  assert.equal(sms[0].stepId, steps[0]);

  // And asking twice does not queue the same SMS twice.
  const again = reviveAfterPhoneFix(member.id, new Date("2026-09-01T06:05:00.000Z"));
  assert.equal(again.resumed, 0, "she is no longer stopped, so there is nothing to revive");
  assert.equal(
    listFollowups({ kind: "sms" }).filter((f) => f.memberId === member.id).length,
    1,
    "still one SMS"
  );
});
