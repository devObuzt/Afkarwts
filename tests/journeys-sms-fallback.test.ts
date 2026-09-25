import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// No WhatsApp credentials in this file on purpose: every send fails, which is
// exactly the condition the SMS fallback exists for.
delete process.env.WHATSAPP_ACCESS_TOKEN;
delete process.env.WHATSAPP_PHONE_NUMBER_ID;
delete process.env.WHATSAPP_WABA_ID;

let seq = 0;

async function cohort(phone: string) {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");

  seq += 1;
  const group = createGroup(`SMS ${seq}`);
  const member = createMember({ name: "سارة حاج", phone, notes: "" })!;
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: `مسار ${seq}`, smsText: "حاولنا نوصلك وما نجحنا" });
  const step = createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    label: "ترحيب",
    freeText: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب",
    smsText: "أهلا {{name}}، بلشنا أسبوع كلين. للتفاصيل ردّي علينا"
  });

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  return { journey, member, step, group };
}

async function enrollmentState(journeyId: number) {
  const { getDb } = await import("@/app/lib/db");
  return getDb()
    .prepare("SELECT state, stop_reason FROM journey_enrollments WHERE journey_id = ?")
    .get(journeyId) as { state: string; stop_reason: string | null };
}

test("a failed WhatsApp step goes out as that step's SMS, and the member stays", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { journey, member, step } = await cohort("+972526800101");

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const sms = listFollowups({ kind: "sms" }).filter((item) => item.memberId === member.id);
  assert.equal(sms.length, 1, "one SMS for the step that failed");
  assert.equal(sms[0].body, "أهلا سارة، بلشنا أسبوع كلين. للتفاصيل ردّي علينا", "the step's own text, with the name filled");
  assert.equal(sms[0].stepId, step.id);

  assert.equal((await enrollmentState(journey.id)).state, "active", "the member stays on the path");
});

test("the next step tries WhatsApp again rather than going straight to SMS", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { createStep } = await import("@/app/lib/journeys/store");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { getDb } = await import("@/app/lib/db");
  const { journey, member } = await cohort("+972526800102");

  const template = (
    getDb().prepare("SELECT template_id t FROM journeys WHERE id = ?").get(journey.id) as { t: number }
  ).t;
  createStep({
    templateId: template,
    week: 2,
    weekday: 0,
    sendTime: "07:00",
    label: "متابعة",
    freeText: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "تذكير",
    smsText: "تذكير أسبوع 2"
  });

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));
  await runDueJourneys(new Date("2026-09-06T05:00:00.000Z"));

  const sms = listFollowups({ kind: "sms" }).filter((item) => item.memberId === member.id);
  assert.equal(sms.length, 2, "each failed step gets its own SMS");
  assert.deepEqual(sms.map((item) => item.body).sort(), ["أهلا سارة، بلشنا أسبوع كلين. للتفاصيل ردّي علينا", "تذكير أسبوع 2"].sort());

  // Both steps were attempted on WhatsApp first; SMS never pre-empts it.
  const attempts = getDb()
    .prepare(
      "SELECT COUNT(*) n FROM journey_sends s JOIN journey_enrollments e ON e.id = s.enrollment_id WHERE e.journey_id = ?"
    )
    .get(journey.id) as { n: number };
  assert.equal(attempts.n, 2);
});

test("a number SMS cannot reach stops and opens a manual task instead", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { journey, member } = await cohort("+970598111333");

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  assert.equal(listFollowups({ kind: "sms" }).filter((i) => i.memberId === member.id).length, 0, "no SMS");
  const manual = listFollowups({ kind: "manual" }).filter((i) => i.memberId === member.id);
  assert.equal(manual.length, 1);
  assert.equal((await enrollmentState(journey.id)).state, "stopped", "nothing can reach them, so the path ends");
});

test("a step told to reuse its free text sends that, not the SMS box", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { updateStep } = await import("@/app/lib/journeys/store");
  const { member, step } = await cohort("+972521000701");

  // What ticking the box does: one text serves both channels, so editing the
  // free text later cannot leave a stale SMS behind.
  updateStep(step.id, {
    freeText: "مراحب {{name}} 👋 اليوم بلشنا، وأنا معك خطوة بخطوة",
    smsUsesFreeText: true
  });

  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const sms = listFollowups({ kind: "sms" }).filter((item) => item.memberId === member.id);
  assert.equal(sms.length, 1);
  assert.equal(sms[0].body, "مراحب سارة 👋 اليوم بلشنا، وأنا معك خطوة بخطوة");
});

test("an empty free text with the box ticked falls through, it does not send a blank", async () => {
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { listFollowups } = await import("@/app/lib/journeys/followups");
  const { updateStep } = await import("@/app/lib/journeys/store");
  const { journey, member, step } = await cohort("+972521000702");

  updateStep(step.id, { freeText: "", smsUsesFreeText: true });
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  // Nothing to say for this step, so the member drops to the path's own
  // answer — the path SMS and a stop — rather than being sent an empty line.
  const sms = listFollowups({ kind: "sms" }).filter((item) => item.memberId === member.id);
  assert.deepEqual(sms.map((item) => item.body), ["حاولنا نوصلك وما نجحنا"]);
  assert.equal((await enrollmentState(journey.id)).state, "stopped");
});
