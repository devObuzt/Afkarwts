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

/**
 * Giving the Clean 18/10 backlog back, as the endpoint does it.
 *
 * Six steps fired while 54 women were off the path. Resuming them is not
 * enough — each step's hour is long past, and the send window drops it —
 * and handing all six over at once would put six templates on one number
 * in the same second.
 */
test("a stopped member gets her backlog one step at a time, and never twice", async () => {
  const { createMember, createGroup, addMembersToGroup, listMessages, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus, owedBacklog, oweStep, resumeEnrollment } =
    await import("@/app/lib/journeys/store");
  const { recordCatchUp } = await import("@/app/lib/journeys/catch-up");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");

  const group = createGroup("كلين التعويض");
  const out = createMember({ name: "هبة", phone: "+972526800021", notes: "" })!;
  addMembersToGroup(group.id, [out.id]);

  const template = createTemplate({ name: "كلين", smsText: "" });
  const ids = [0, 1, 2, 3].map((weekday) =>
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
      templatePreview: "مراحب"
    }).id
  );

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");

  // She gets the first step, then the path closes on her — the message
  // never reached her handset — and three more steps fire without her.
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));
  await runDueJourneys(new Date("2026-09-01T06:00:00.000Z"));
  await runDueJourneys(new Date("2026-09-02T06:00:00.000Z"));
  await runDueJourneys(new Date("2026-09-03T06:00:00.000Z"));

  const enrollment = getDb()
    .prepare("SELECT id, state FROM journey_enrollments WHERE journey_id = ?")
    .get(journey.id) as { id: number; state: string };
  assert.equal(enrollment.state, "stopped");
  const sentOnce = () => listMessages(out.id).filter((m) => m.direction === "outgoing").length;
  assert.equal(sentOnce(), 1, "only the first step ever went out");

  // What the endpoint does: resume, owe the oldest gap, hand the rest to
  // the one-a-minute release.
  const at = new Date("2026-09-03T07:00:00.000Z");
  const backlog = owedBacklog(enrollment.id, at);
  assert.deepEqual(
    backlog.map((row) => row.stepId),
    [ids[1], ids[2], ids[3]],
    "the step she received is not in the backlog"
  );
  resumeEnrollment(enrollment.id);
  oweStep(enrollment.id, backlog[0].stepId);
  recordCatchUp(enrollment.id, "accepted", at);

  await runDueJourneys(at);
  assert.equal(sentOnce(), 2, "one owed step, not three");

  // A minute later the next one is let through, and so on.
  await runDueJourneys(new Date(at.getTime() + 61 * 1000));
  assert.equal(sentOnce(), 3);
  await runDueJourneys(new Date(at.getTime() + 122 * 1000));
  assert.equal(sentOnce(), 4);

  // And then it stops on its own — nothing is owed twice.
  await runDueJourneys(new Date(at.getTime() + 183 * 1000));
  assert.equal(sentOnce(), 4, "the backlog is empty, so nothing more goes out");
  assert.deepEqual(owedBacklog(enrollment.id, new Date(at.getTime() + 183 * 1000)), []);
});

/** The five outcomes add up to the cohort, and each one opens into names. */
test("every woman carries exactly one outcome, and they sum to the cohort", async () => {
  const { createMember, createGroup, addMembersToGroup, listMessages, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { buildIncomingPayload, buildStatusPayload, handleWebhookPayload } = await import(
    "@/app/lib/whatsapp-webhook"
  );
  const { journeyFunnel, whoOnStep, OUTCOMES } = await import("@/app/lib/journeys/report");

  const group = createGroup("كلين الاحتمالات");
  const talker = createMember({ name: "ردّت", phone: "+972526800031", notes: "" })!;
  const reader = createMember({ name: "قرأت", phone: "+972526800032", notes: "" })!;
  const quiet = createMember({ name: "وصلها", phone: "+972526800033", notes: "" })!;
  const lost = createMember({ name: "ما وصلها", phone: "+972526800034", notes: "" })!;
  addMembersToGroup(group.id, [talker.id, reader.id, quiet.id, lost.id]);

  const template = createTemplate({ name: "كلين", smsText: "" });
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
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const whatsappId = (memberId: number) =>
    listMessages(memberId).find((m) => m.direction === "outgoing")!.whatsappMessageId!;
  for (const member of [talker, reader]) {
    await handleWebhookPayload(buildStatusPayload({ whatsappMessageId: whatsappId(member.id), status: "read" }));
  }
  await handleWebhookPayload(buildStatusPayload({ whatsappMessageId: whatsappId(quiet.id), status: "delivered" }));
  await handleWebhookPayload(buildIncomingPayload({ phone: talker.phone, text: "وصلتني" }));
  // لولا هيك الردّ بينحسب بوقت الساعة الحقيقية مش بعد الإرسال
  getDb()
    .prepare("UPDATE messages SET created_at = ? WHERE member_id = ? AND direction = 'incoming'")
    .run("2026-08-30 06:00:00", talker.id);

  // وواحدة خامسة انضافت للمجموعة بعد ما الخطوة فاتت — ما بعتنا إلها ولا رسالة
  const nobody = createMember({ name: "ولا رسالة", phone: "+972526800035", notes: "" })!;
  addMembersToGroup(group.id, [nobody.id]);
  const { syncEnrollments } = await import("@/app/lib/journeys/store");
  syncEnrollments(journey.id, new Date("2026-08-30T05:30:00.000Z"));

  const funnel = journeyFunnel(journey.id);
  assert.deepEqual(funnel.outcomes, {
    never_sent: 1,
    not_delivered: 1,
    delivered_unread: 1,
    read_silent: 1,
    replied: 1
  });
  assert.equal(
    OUTCOMES.reduce((sum, name) => sum + funnel.outcomes[name], 0),
    funnel.enrolled,
    "nobody is counted twice and nobody is missing"
  );

  for (const [name, member] of [
    ["never_sent", nobody],
    ["not_delivered", lost],
    ["delivered_unread", quiet],
    ["read_silent", reader],
    ["replied", talker]
  ] as const) {
    assert.deepEqual(
      whoOnStep(journey.id, null, `outcome:${name}`).map((row) => row.memberId),
      [member.id],
      name
    );
  }
});
