import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("the day opens on what needs a decision, not on a list of chats", async () => {
  const { createMember, createGroup, addMembersToGroup, getDb } = await import("@/app/lib/db");
  const { createForm, listFields, submitForm } = await import("@/app/lib/forms/store");
  const { createTemplate, createStep, createJourney, setJourneyStatus, syncEnrollments } = await import(
    "@/app/lib/journeys/store"
  );
  const { getToday } = await import("@/app/lib/today");

  const group = createGroup("كلين 04.10");
  const form = createForm({ name: "تسجيل كلين", groupId: group.id, fromTemplate: true });

  const answers: Record<string, string> = {};
  for (const field of listFields(form.id)) {
    answers[String(field.id)] =
      field.mapsTo === "name" ? "ليلى عوض" : field.mapsTo === "phone" ? "0521234567" : field.options[0] ?? "نعم";
  }
  submitForm(form.token, answers);

  const member = createMember({ name: "مريم حسارمة", phone: "+972521111111" });
  addMembersToGroup(group.id, [member.id]);

  const template = createTemplate({ name: "Clean Path" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 3,
    sendTime: "16:00",
    label: "تعليمات الظهر",
    templateName: "clean_day1_midday",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "تعليمات"
  });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-10-04" });
  setJourneyStatus(journey.id, "active");
  syncEnrollments(journey.id, new Date("2026-10-04T05:00:00.000Z"));

  getDb()
    .prepare("INSERT INTO messages (member_id, direction, body, status) VALUES (?, 'incoming', 'بقدر أبدل الشوفان؟', 'received')")
    .run(member.id);

  const today = getToday(new Date("2026-10-04T06:00:00.000Z"));

  assert.ok(
    today.decisions.some((item) => item.title.includes("تسجيل جديد") && item.title.includes("تسجيل كلين")),
    `a pending registration is a decision — got ${today.decisions.map((d) => d.title).join(" / ")}`
  );

  const path = today.paths.find((item) => item.journeyId === journey.id)!;
  assert.equal(path.groupName, "كلين 04.10");
  assert.equal(path.members, 1);
  assert.equal(path.nextLabel, "تعليمات الظهر", "the next thing that will go out by itself");
  assert.ok(path.nextAt && new Date(path.nextAt) > new Date("2026-10-04T06:00:00.000Z"));

  assert.deepEqual(
    today.replies.map((reply) => reply.name),
    ["مريم حسارمة"],
    "she wrote last and nobody answered"
  );
});

test("an answered conversation leaves the waiting list", async () => {
  const { createMember, getDb } = await import("@/app/lib/db");
  const { getToday } = await import("@/app/lib/today");

  const member = createMember({ name: "سارة حاج", phone: "+972522222222" });
  const db = getDb();
  db.prepare("INSERT INTO messages (member_id, direction, body, status, created_at) VALUES (?, 'incoming', 'سؤال', 'received', '2026-10-04 08:00:00')").run(member.id);

  assert.ok(getToday(new Date("2026-10-04T09:00:00.000Z")).replies.some((r) => r.memberId === member.id));

  db.prepare("INSERT INTO messages (member_id, direction, body, status, created_at) VALUES (?, 'outgoing', 'جواب', 'delivered', '2026-10-04 08:30:00')").run(member.id);

  assert.ok(!getToday(new Date("2026-10-04T09:00:00.000Z")).replies.some((r) => r.memberId === member.id));
});
