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

/**
 * Being put back in the group undoes the removal.
 *
 * This was the deepest of the three: `syncEnrollments` read «she already
 * has a row, skip her», so a removal could never be undone. Sawar was
 * taken out of the Clean 18/10 group on 15.10 over a mistyped number;
 * putting her back in the group on 19.10 changed nothing at all, because
 * the sync never looked at a removed row again.
 */
test("putting a removed member back in the group puts her back on the path", async () => {
  const { createMember, createGroup, addMembersToGroup, removeMemberFromGroup, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus, syncEnrollments } = await import(
    "@/app/lib/journeys/store"
  );
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");

  const group = createGroup("كلين الرجوع");
  const member = createMember({ name: "سوار رجعت", phone: "+972526800077", notes: "" })!;
  // A second woman who never leaves: «behind» means behind the cohort, so
  // there has to be a cohort that got the steps she did not.
  const stays = createMember({ name: "رفيقتها", phone: "+972526800078", notes: "" })!;
  addMembersToGroup(group.id, [member.id, stays.id]);

  const template = createTemplate({ name: "كلين", smsText: "" });
  for (const weekday of [0, 1, 2]) {
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
    });
  }

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  const state = () =>
    (
      getDb()
        .prepare(
          "SELECT state, stop_reason FROM journey_enrollments WHERE journey_id = ? AND member_id = ?"
        )
        .get(journey.id, member.id) as { state: string; stop_reason: string | null }
    );

  // Taken out of the cohort, and two steps fire without her.
  removeMemberFromGroup(group.id, member.id);
  await runDueJourneys(new Date("2026-08-31T05:00:00.000Z"));
  assert.equal(state().state, "removed");
  await runDueJourneys(new Date("2026-09-01T05:00:00.000Z"));

  // Put back in the group.
  addMembersToGroup(group.id, [member.id]);
  const sync = syncEnrollments(journey.id, new Date("2026-09-01T06:00:00.000Z"));

  assert.equal(sync.returned, 1, "the removal is undone");
  assert.equal(sync.added, 0, "no second enrollment — her history is one record");
  assert.equal(state().state, "active");
  assert.equal(state().stop_reason, null);
  assert.equal(
    sync.joinedLate.map((row) => row.missed)[0],
    2,
    "and she is counted as behind by the two steps the cohort got without her"
  );
});

/**
 * Every enrolled woman is in exactly one place on every step's row.
 *
 * Wisam read «252 enrolled» at the top and «246 sent · 0 not sent» on the
 * first step and asked where the other six went. They were there — 5
 * failed and 1 missed — but nothing on the screen said the six numbers
 * were supposed to add up, and «missed» was the one of them that could
 * not be opened. This is the arithmetic, asserted.
 */
test("a step's numbers account for every enrolled woman, and each opens into names", async () => {
  const { createMember, createGroup, addMembersToGroup, getDb } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { stepBreakdown, whoOnStep } = await import("@/app/lib/journeys/report");

  const group = createGroup("كلين الحساب");
  const stay = createMember({ name: "باقية", phone: "+972526800091", notes: "" })!;
  const late = createMember({ name: "متأخرة", phone: "+972526800092", notes: "" })!;
  addMembersToGroup(group.id, [stay.id]);

  const template = createTemplate({ name: "كلين", smsText: "" });
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
    templatePreview: "مراحب"
  }).id;

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  // She joins after the step's window shut, one message behind — the
  // catch-up sends that one rather than writing her off.
  addMembersToGroup(group.id, [late.id]);
  await runDueJourneys(new Date("2026-09-01T05:00:00.000Z"));

  // And a third, enrolled all along, whose step the window shut on — what
  // the runner records when a step's twelve hours pass with nothing sent.
  const gone = createMember({ name: "فاتتها", phone: "+972526800093", notes: "" })!;
  addMembersToGroup(group.id, [gone.id]);
  await runDueJourneys(new Date("2026-09-01T05:05:00.000Z"));
  const goneEnrollment = (
    getDb()
      .prepare("SELECT id FROM journey_enrollments WHERE journey_id = ? AND member_id = ?")
      .get(journey.id, gone.id) as { id: number }
  ).id;
  getDb()
    .prepare("UPDATE journey_sends SET state = 'missed' WHERE enrollment_id = ? AND step_id = ?")
    .run(goneEnrollment, step);

  const row = stepBreakdown(journey.id).find((item) => item.stepId === step)!;
  const enrolled = (
    getDb().prepare("SELECT COUNT(*) AS n FROM journey_enrollments WHERE journey_id = ?").get(journey.id) as {
      n: number;
    }
  ).n;

  const states = getDb()
    .prepare(
      `SELECT s.state AS key, COUNT(*) AS n FROM journey_sends s
         JOIN journey_enrollments e ON e.id = s.enrollment_id
        WHERE e.journey_id = ? AND s.step_id = ? GROUP BY s.state`
    )
    .all(journey.id, step) as Array<{ key: string; n: number }>;

  const rows = states.reduce((sum, item) => sum + item.n, 0);
  assert.equal(rows + row.notSent, enrolled, "a row for her, or counted as having none — never neither");

  assert.equal(row.missed, 1);
  assert.deepEqual(
    whoOnStep(journey.id, step, "missed").map((item) => item.memberId),
    [gone.id],
    "«missed» opens into the woman it is about"
  );
  // The late joiner was behind by one message, so the catch-up simply sent
  // it — one is sent, more than one is offered.
  assert.equal(row.sentTemplate + row.sentText, 2);
  assert.deepEqual(
    whoOnStep(journey.id, step, "deferred"),
    [],
    "and a bucket with nobody in it is an empty list, not an error"
  );
});


/**
 * «انبعتت 249 · وصلت 248» — ومين الوحدة؟
 *
 * Wisam had to ask, every time, because the gap between those two numbers
 * was the one thing on the row that was not a column: delivered was a
 * link, failed was a link, and the woman whose message simply never
 * landed appeared in neither.
 */
test("the gap between sent and delivered is its own number, and it opens", async () => {
  const { createMember, createGroup, addMembersToGroup, listMessages } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { buildStatusPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");
  const { stepBreakdown, whoOnStep } = await import("@/app/lib/journeys/report");

  const group = createGroup("كلين الوصول");
  const landed = createMember({ name: "وصلتها", phone: "+972526800101", notes: "" })!;
  const inFlight = createMember({ name: "لمار", phone: "+972526800102", notes: "" })!;
  addMembersToGroup(group.id, [landed.id, inFlight.id]);

  const template = createTemplate({ name: "كلين", smsText: "" });
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
    templatePreview: "مراحب"
  }).id;

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  await runDueJourneys(new Date("2026-08-30T05:00:00.000Z"));

  // One receipt comes back. The other message stays «sent» — Meta took it
  // and nothing more was heard, which is a phone that is off, not a
  // failure and not a queue of ours.
  const whatsappId = listMessages(landed.id).find((m) => m.direction === "outgoing")!.whatsappMessageId!;
  await handleWebhookPayload(buildStatusPayload({ whatsappMessageId: whatsappId, status: "delivered" }));

  const row = stepBreakdown(journey.id).find((item) => item.stepId === step)!;
  assert.equal(row.sentText + row.sentTemplate, 2);
  assert.equal(row.delivered, 1);
  assert.equal(row.undelivered, 1, "the gap is a number of its own");
  assert.equal(row.failed, 0, "it did not fail — nothing came back at all");

  assert.deepEqual(
    whoOnStep(journey.id, step, "undelivered").map((item) => item.name),
    ["لمار"],
    "and it opens into her name without anybody asking"
  );

  // Sent accounts for itself exactly: landed, never landed, or failed.
  assert.equal(row.delivered + row.undelivered + row.failed, row.sentText + row.sentTemplate);
});
