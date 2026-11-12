import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function cohort() {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, syncEnrollments } = await import("@/app/lib/journeys/store");

  seq += 1;
  const group = createGroup(`محو ${seq}`);
  const member = createMember({ name: `منتسبة ${seq}`, phone: `+97250800${String(seq).padStart(4, "0")}`, notes: "" })!;
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: `محو ${seq}` });
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
    smsText: ""
  });

  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-08-30" });
  syncEnrollments(journey.id, new Date("2026-08-29T06:00:00.000Z"));
  return { journey, group, member, step };
}

test("مسار ما بعت ولا رسالة بينمحى هو وتسجيلاته", async () => {
  const { deleteJourney, getJourney } = await import("@/app/lib/journeys/store");
  const { getDb } = await import("@/app/lib/db");
  const { journey } = await cohort();

  const before = (
    getDb().prepare("SELECT COUNT(*) AS n FROM journey_enrollments WHERE journey_id = ?").get(journey.id) as { n: number }
  ).n;
  assert.ok(before > 0, "المسار لازم يكون فيه تسجيلات قبل المحو");

  assert.equal(deleteJourney(journey.id).ok, true);
  assert.equal(getJourney(journey.id), null);

  // 🔴 الكاسكيد بالسكيما زينة — الـpragma مطفي. فلو ما انمحوا بالإيد
  // بيضلوا صفوف معلّقة بتشاور على مسار راح.
  assert.equal(
    (getDb().prepare("SELECT COUNT(*) AS n FROM journey_enrollments WHERE journey_id = ?").get(journey.id) as { n: number }).n,
    0
  );
});

test("مسار بعت رسالة ما بينمحى — السجلّ أهم", async () => {
  const { claimSend, deleteJourney, getJourney } = await import("@/app/lib/journeys/store");
  const { getDb } = await import("@/app/lib/db");
  const { journey, step } = await cohort();

  const enrollmentId = (
    getDb().prepare("SELECT id FROM journey_enrollments WHERE journey_id = ?").get(journey.id) as { id: number }
  ).id;
  claimSend(enrollmentId, step.id, new Date());

  const result = deleteJourney(journey.id);
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.error, /ما بينمحى/);
  assert.notEqual(getJourney(journey.id), null);
});
