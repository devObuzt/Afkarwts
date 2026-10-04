import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

/** A member who registered through a form, joined a cohort, and was messaged. */
async function person() {
  const { createMember, createGroup, addMembersToGroup, getDb } = await import("@/app/lib/db");
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { approveSubmission } = await import("@/app/lib/forms/approve");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");

  seq += 1;
  const group = createGroup(`سجل ${seq}`);
  const form = createForm({ name: `سجل ${seq}`, groupId: group.id, fromTemplate: true });

  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name"
        ? "ليلى عوض"
        : field.mapsTo === "phone"
          ? `05100${String(seq).padStart(5, "0")}`
          : field.mapsTo === "city"
            ? "عرابة"
            : field.kind === "date"
              ? "1988-03-21"
              : field.options.length
                ? field.options[0]
                : "نعم";
  }
  const submitted = submitForm(form.token, answers) as { ok: true; id: number };
  const approved = approveSubmission(submitted.id) as { ok: true; memberId: number };

  const template = createTemplate({ name: `مسار ${seq}` });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "07:00",
    label: "ترحيب",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  setJourneyStatus(journey.id, "active");
  // Enrolment happens on a tick, not on approval — the same order as live.
  const { syncEnrollments } = await import("@/app/lib/journeys/store");
  syncEnrollments(journey.id, new Date("2026-08-30T05:00:00.000Z"));

  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'outgoing', 'مراحب ليلى', 'delivered')")
    .run(approved.memberId);

  return { memberId: approved.memberId, group, form, journey };
}

test("a person's record gathers what is scattered across four pages today", async () => {
  const { getPersonRecord } = await import("@/app/lib/people");
  const { memberId, group } = await person();

  const record = getPersonRecord(memberId)!;

  assert.equal(record.member.name, "ليلى عوض");
  assert.equal(record.member.city, "عرابة");
  assert.deepEqual(record.groups.map((g) => g.name), [group.name]);
  assert.equal(record.submissions.length, 1, "her registration");
  // 19 of the template's 20: «شو هو المرض» stays hidden unless «آخر» is ticked.
  assert.equal(record.submissions[0].answers.length, 19);
  assert.equal(record.journeys.length, 1, "the cohort she is on");
  assert.equal(record.messages.length, 1);
});

test("the timeline puts every channel in one stream, newest first", async () => {
  const { getPersonRecord } = await import("@/app/lib/people");
  const { memberId } = await person();

  const record = getPersonRecord(memberId)!;
  const kinds = record.timeline.map((entry) => entry.kind);

  assert.ok(kinds.includes("message"), "what we sent");
  assert.ok(kinds.includes("submission"), "what she filled in");
  assert.ok(kinds.includes("joined"), "when she entered the cohort");

  const times = record.timeline.map((entry) => new Date(entry.at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a), "newest first");
});

test("the medical answers are pulled out, because they decide her programme", async () => {
  const { getPersonRecord } = await import("@/app/lib/people");
  const { memberId } = await person();

  const record = getPersonRecord(memberId)!;
  const labels = record.highlights.map((h) => h.label);

  assert.ok(labels.some((l) => l.includes("أمراض")), `the illnesses question — got ${labels.join(" / ")}`);
  assert.ok(record.highlights.length >= 3, "not one answer, the ones that matter before building a programme");
});

test("an unknown person is null rather than a half-empty record", async () => {
  const { getPersonRecord } = await import("@/app/lib/people");
  assert.equal(getPersonRecord(999999), null);
});

test("the record says whether a free-text reply is still allowed", async () => {
  const { getPersonRecord } = await import("@/app/lib/people");
  const { createMember, getDb } = await import("@/app/lib/db");

  const quiet = createMember({ name: "ما كتبت", phone: "+972561111111" });
  assert.equal(getPersonRecord(quiet.id)!.windowOpen, false, "nobody wrote, so there is no window");

  const wrote = createMember({ name: "كتبت هلق", phone: "+972562222222" });
  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'incoming', 'مراحب', 'received')")
    .run(wrote.id);
  assert.equal(getPersonRecord(wrote.id)!.windowOpen, true);

  const old = createMember({ name: "كتبت قبل تلات أيام", phone: "+972563333333" });
  getDb()
    .prepare(
      "INSERT INTO messages (member_id, direction, body, status, created_at) VALUES (?, 'incoming', 'مراحب', 'received', '2026-01-01 10:00:00')"
    )
    .run(old.id);
  const record = getPersonRecord(old.id)!;
  assert.equal(record.windowOpen, false, "a send here would be accepted and dropped");
  assert.equal(record.windowClosesAt, "2026-01-02T10:00:00.000Z");
});
