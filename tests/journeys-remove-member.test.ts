import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
delete process.env.WHATSAPP_WABA_ID;

let seq = 0;

async function cohort() {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { createTemplate, createStep, createJourney, setJourneyStatus } = await import("@/app/lib/journeys/store");

  seq += 1;
  const group = createGroup(`خروج ${seq}`);
  const member = createMember({ name: `خارج ${seq}`, phone: `+97250900${String(seq).padStart(4, "0")}`, notes: "" })!;
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: `خروج ${seq}`, smsText: "تواصلي معنا" });
  createStep({
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
  setJourneyStatus(journey.id, "active");
  return { journey, group, member };
}

async function enrollmentState(journeyId: number, memberId: number) {
  const { getDb } = await import("@/app/lib/db");
  return (
    getDb()
      .prepare("SELECT state FROM journey_enrollments WHERE journey_id = ? AND member_id = ?")
      .get(journeyId, memberId) as { state: string }
  ).state;
}

test("taking an active member out of the group takes them off the path", async () => {
  const { removeMemberFromGroup } = await import("@/app/lib/db");
  const { syncEnrollments } = await import("@/app/lib/journeys/store");
  const { journey, group, member } = await cohort();

  syncEnrollments(journey.id, new Date("2026-08-30T05:00:00.000Z"));
  removeMemberFromGroup(group.id, member.id);
  syncEnrollments(journey.id, new Date("2026-08-30T06:00:00.000Z"));

  assert.equal(await enrollmentState(journey.id, member.id), "removed");
});

test("a stopped member taken out of the group also leaves, and their tasks close", async () => {
  const { removeMemberFromGroup } = await import("@/app/lib/db");
  const { syncEnrollments, stopEnrollment } = await import("@/app/lib/journeys/store");
  const { getDb } = await import("@/app/lib/db");
  const { openFollowupsForStop, listFollowups } = await import("@/app/lib/journeys/followups");
  const { journey, group, member } = await cohort();

  syncEnrollments(journey.id, new Date("2026-08-30T05:00:00.000Z"));

  // The shape Afkar hit: دينا was stopped first — her number takes no
  // WhatsApp — and only then taken out of the cohort.
  const enrollment = (
    getDb()
      .prepare("SELECT id FROM journey_enrollments WHERE journey_id = ? AND member_id = ?")
      .get(journey.id, member.id) as { id: number }
  ).id;
  stopEnrollment(enrollment, "send_failed", new Date("2026-08-30T05:30:00.000Z"));
  openFollowupsForStop({ enrollmentId: enrollment, memberId: member.id, reason: "send_failed", smsText: "" });
  assert.equal(listFollowups({ state: "open" }).filter((f) => f.memberId === member.id).length, 1);

  removeMemberFromGroup(group.id, member.id);
  syncEnrollments(journey.id, new Date("2026-08-30T06:00:00.000Z"));

  assert.equal(await enrollmentState(journey.id, member.id), "removed", "out of the group is out of the path");
  assert.equal(
    listFollowups({ state: "open" }).filter((f) => f.memberId === member.id).length,
    0,
    "and nobody is asked to chase someone who left"
  );
});
