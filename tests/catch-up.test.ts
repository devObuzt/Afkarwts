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

/** A cohort whose first `before` steps are already in the past. */
async function cohort(before: number) {
  const { addMembersToGroup, createGroup, createMember } = await import("@/app/lib/db");
  const { createJourney, createStep, createTemplate, setJourneyStatus } = await import("@/app/lib/journeys/store");
  seq += 1;

  const group = createGroup(`كلين لحاق ${seq}`);
  const early = createMember({ name: "سارة عوض", phone: `+9725261${1000 + seq}0`, notes: "" })!;
  addMembersToGroup(group.id, [early.id]);

  const template = createTemplate({ name: `كلين لحاق ${seq}`, smsText: "" });
  // Sunday to Saturday of the cohort week, one step a day.
  for (let day = 0; day < before + 2; day++) {
    createStep({
      templateId: template.id,
      week: 1,
      weekday: day,
      sendTime: "09:00",
      label: `يوم ${day + 1}`,
      freeText: "",
      templateName: "clean_week",
      templateLanguage: "ar",
      bodyParams: [],
      templatePreview: "مراحب"
    });
  }

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-10-11" });
  setJourneyStatus(journey.id, "active");

  // The cohort actually receives the first `before` days. Without this
  // nothing was ever sent, and a step nobody got is not a step anybody is
  // behind on — a whole path switched on late is a different thing.
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  for (let day = 0; day < before; day++) {
    const at = new Date(Date.UTC(2026, 9, 11 + day, 7, 0, 0));
    await runDueJourneys(at);
  }

  return { group, journey, early };
}

/** Adds a woman and runs the sync at `now`, returning what she missed. */
async function joinLate(groupId: number, journeyId: number, now: Date) {
  const { addMembersToGroup, createMember } = await import("@/app/lib/db");
  const { syncEnrollments } = await import("@/app/lib/journeys/store");
  seq += 1;
  const her = createMember({ name: "ليلى حسن", phone: `+9725262${1000 + seq}0`, notes: "" })!;
  addMembersToGroup(groupId, [her.id]);
  return { her, sync: syncEnrollments(journeyId, now) };
}

test("one missed message is simply sent — she is a day behind, not lost", async () => {
  const { greetLateJoiner } = await import("@/app/lib/journeys/catch-up");
  const { missedOnJoin } = await import("@/app/lib/journeys/store");
  const { group, journey } = await cohort(1);

  // Day 1 was 11/10 at 09:00; she joins on the 12th, past its window.
  const { sync } = await joinLate(group.id, journey.id, new Date("2026-10-12T06:00:00.000Z"));
  const late = sync.joinedLate.find((row) => row.missed === 1);
  assert.ok(late, "one step was written off for her");

  const result = await greetLateJoiner(late!);
  assert.equal(result.action, "sent-the-one");
  assert.deepEqual(missedOnJoin(late!.enrollmentId), [], "the write-off is cleared, so the runner sends it");
});

test("more than one is offered, and nothing goes out until she answers", async () => {
  const { greetLateJoiner, catchUpState } = await import("@/app/lib/journeys/catch-up");
  const { missedOnJoin } = await import("@/app/lib/journeys/store");
  const { group, journey } = await cohort(4);

  const { sync } = await joinLate(group.id, journey.id, new Date("2026-10-15T06:00:00.000Z"));
  const late = sync.joinedLate.find((row) => row.missed > 1);
  assert.ok(late, `expected several missed, got ${JSON.stringify(sync.joinedLate)}`);

  const before = missedOnJoin(late!.enrollmentId).length;
  await greetLateJoiner(late!);

  assert.equal(catchUpState(late!.enrollmentId), "offered");
  assert.equal(
    missedOnJoin(late!.enrollmentId).length,
    before,
    "not one of them is released on the strength of an unanswered question"
  );
});

test("she is asked once, however many times the sync runs", async () => {
  const { greetLateJoiner } = await import("@/app/lib/journeys/catch-up");
  const { group, journey } = await cohort(4);
  const { sync } = await joinLate(group.id, journey.id, new Date("2026-10-15T06:00:00.000Z"));
  const late = sync.joinedLate.find((row) => row.missed > 1)!;

  await greetLateJoiner(late);
  assert.equal((await greetLateJoiner(late)).action, "already-handled");
  assert.equal((await greetLateJoiner(late)).action, "already-handled");
});

test("«يا ريت» releases them one at a time, not all at once", async () => {
  const { CATCH_UP_GAP_MS, acceptCatchUp, greetLateJoiner, releaseNextCatchUp } = await import(
    "@/app/lib/journeys/catch-up"
  );
  const { missedOnJoin } = await import("@/app/lib/journeys/store");
  const { group, journey } = await cohort(4);
  const { sync } = await joinLate(group.id, journey.id, new Date("2026-10-15T06:00:00.000Z"));
  const late = sync.joinedLate.find((row) => row.missed > 1)!;
  await greetLateJoiner(late);

  const total = missedOnJoin(late.enrollmentId).length;
  const start = new Date("2026-10-15T07:00:00.000Z");
  acceptCatchUp(late.enrollmentId, start);
  assert.equal(missedOnJoin(late.enrollmentId).length, total - 1, "the first one goes");

  // A burst of ten templates to one number reads as spam to Meta, and the
  // number's quality is what sets the account's whole daily ceiling.
  releaseNextCatchUp(new Date(start.getTime() + 5 * 1000));
  assert.equal(missedOnJoin(late.enrollmentId).length, total - 1, "five seconds later, still one");

  releaseNextCatchUp(new Date(start.getTime() + CATCH_UP_GAP_MS + 1000));
  assert.equal(missedOnJoin(late.enrollmentId).length, total - 2, "a minute later, the next");
});

test("«ما في داعي» means nothing more is sent", async () => {
  const { catchUpState, declineCatchUp, greetLateJoiner, releaseNextCatchUp } = await import(
    "@/app/lib/journeys/catch-up"
  );
  const { missedOnJoin } = await import("@/app/lib/journeys/store");
  const { group, journey } = await cohort(4);
  const { sync } = await joinLate(group.id, journey.id, new Date("2026-10-15T06:00:00.000Z"));
  const late = sync.joinedLate.find((row) => row.missed > 1)!;
  await greetLateJoiner(late);

  const total = missedOnJoin(late.enrollmentId).length;
  declineCatchUp(late.enrollmentId);
  releaseNextCatchUp(new Date("2026-10-16T09:00:00.000Z"));

  assert.equal(catchUpState(late.enrollmentId), "declined");
  assert.equal(missedOnJoin(late.enrollmentId).length, total, "her «no» is a no");
});

test("the button she presses is what answers the offer", async () => {
  const { greetLateJoiner, catchUpState } = await import("@/app/lib/journeys/catch-up");
  const { answerCatchUpByPress } = await import("@/app/lib/journeys/catch-up-reply");
  const { group, journey } = await cohort(4);
  const { her, sync } = await joinLate(group.id, journey.id, new Date("2026-10-15T06:00:00.000Z"));
  // Hers, not whoever else this sync happened to enrol: the cohort's
  // first member is enrolled on the same pass and is late too.
  const late = sync.joinedLate.find((row) => row.memberId === her.id && row.missed > 1)!;
  await greetLateJoiner(late);

  // Anything that is not one of the two buttons is an ordinary message.
  assert.equal((await answerCatchUpByPress(her.id, "مرحبا")).handled, false);
  assert.equal(catchUpState(late.enrollmentId), "offered");

  assert.equal((await answerCatchUpByPress(her.id, "يا ريت")).handled, true);
  assert.equal(catchUpState(late.enrollmentId), "accepted");
});

test("a woman who joined on time is never offered anything", async () => {
  const { group, journey } = await cohort(0);
  const { sync } = await joinLate(group.id, journey.id, new Date("2026-10-11T05:00:00.000Z"));
  assert.deepEqual(sync.joinedLate, [], "nothing had gone out yet, so nothing was missed");
});

test("once she has it, the step is no longer exempt from the window", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { greetLateJoiner } = await import("@/app/lib/journeys/catch-up");
  const { runDueJourneys } = await import("@/app/lib/journeys/runner");
  const { group, journey } = await cohort(1);

  const { her, sync } = await joinLate(group.id, journey.id, new Date("2026-10-12T06:00:00.000Z"));
  const late = sync.joinedLate.find((row) => row.memberId === her.id)!;
  await greetLateJoiner(late);
  await runDueJourneys(new Date("2026-10-12T06:05:00.000Z"));

  // Left behind, the note would keep one step permanently exempt for one
  // woman — a quiet hole in the rule that stops midnight messages.
  const owed = getDb()
    .prepare("SELECT COUNT(*) AS n FROM journey_owed WHERE enrollment_id = ?")
    .get(late.enrollmentId) as { n: number };
  assert.equal(owed.n, 0, "the debt is cleared when it is paid");
});
