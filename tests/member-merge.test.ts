import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";

let seq = 0;

test("merging carries her whole history onto the record that is kept", async () => {
  const { addMembersToGroup, createGroup, createMember, createMessage, getMember, listGroupMembers, listMessages, mergeMembers } =
    await import("@/app/lib/db");
  seq += 1;

  // How it really happens: she registered with a digit wrong, which made a
  // second record, while her real number was already in the list.
  const real = createMember({ name: "سوار", phone: "+972508254566", notes: "من قائمة المبيعات" })!;
  const typo = createMember({ name: "siwar belal", phone: "+972208254566", notes: "" })!;

  const sales = createGroup(`مبيعات ${seq}`);
  const clean = createGroup(`كلين ${seq}`);
  addMembersToGroup(sales.id, [real.id]);
  addMembersToGroup(clean.id, [typo.id]);

  createMessage({ memberId: real.id, direction: "incoming", body: "مرحبا", status: "received" });
  createMessage({ memberId: typo.id, direction: "outgoing", body: "رسالة الكلين", status: "failed" });

  const result = mergeMembers(real.id, typo.id) as { ok: true };
  assert.equal(result.ok, true);

  assert.equal(getMember(typo.id), null, "the duplicate record is gone");
  const kept = getMember(real.id)!;
  assert.equal(kept.phone, "+972508254566", "and the kept one has the number that works");

  const bodies = listMessages(real.id).map((message) => message.body);
  assert.ok(bodies.includes("مرحبا") && bodies.includes("رسالة الكلين"), "both sides of her history");
  assert.ok(listGroupMembers(clean.id).some((m) => m.id === real.id), "she is in the cohort now");
  assert.ok(listGroupMembers(sales.id).some((m) => m.id === real.id), "and still in the list she came from");
});

test("a group both records were in does not become two rows", async () => {
  const { addMembersToGroup, createGroup, createMember, listGroupMembers, mergeMembers } = await import("@/app/lib/db");
  seq += 1;
  const keep = createMember({ name: "أ", phone: "+97250111" + seq + "00", notes: "" })!;
  const drop = createMember({ name: "ب", phone: "+97250222" + seq + "00", notes: "" })!;
  const group = createGroup(`مشتركة ${seq}`);
  addMembersToGroup(group.id, [keep.id, drop.id]);

  mergeMembers(keep.id, drop.id);
  const inside = listGroupMembers(group.id).filter((m) => m.id === keep.id);
  assert.equal(inside.length, 1, "once, not twice");
});

test("a woman on the same journey under both records keeps one enrolment", async () => {
  const { addMembersToGroup, createGroup, createMember, getDb, mergeMembers } = await import("@/app/lib/db");
  const { createJourney, createStep, createTemplate, setJourneyStatus, syncEnrollments } = await import(
    "@/app/lib/journeys/store"
  );
  seq += 1;

  const group = createGroup(`مسار ${seq}`);
  const keep = createMember({ name: "أ", phone: "+97250333" + seq + "00", notes: "" })!;
  const drop = createMember({ name: "ب", phone: "+97250444" + seq + "00", notes: "" })!;
  addMembersToGroup(group.id, [keep.id, drop.id]);

  const template = createTemplate({ name: `مسار ${seq}`, smsText: "" });
  createStep({
    templateId: template.id,
    week: 1,
    weekday: 0,
    sendTime: "09:00",
    label: "ترحيب",
    freeText: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: [],
    templatePreview: "مراحب"
  });
  const journey = createJourney({ templateId: template.id, groupId: group.id, anchorDate: "2026-10-11" });
  setJourneyStatus(journey.id, "active");
  syncEnrollments(journey.id, new Date("2026-10-11T04:00:00.000Z"));

  mergeMembers(keep.id, drop.id);

  const rows = getDb()
    .prepare("SELECT COUNT(*) AS n FROM journey_enrollments WHERE journey_id = ? AND member_id = ?")
    .get(journey.id, keep.id) as { n: number };
  assert.equal(rows.n, 1, "one woman, one place on the path");

  const orphans = getDb()
    .prepare("SELECT COUNT(*) AS n FROM journey_enrollments WHERE member_id = ?")
    .get(drop.id) as { n: number };
  assert.equal(orphans.n, 0, "and nothing left pointing at the record that went");
});

test("merging a record into itself is refused", async () => {
  const { createMember, mergeMembers } = await import("@/app/lib/db");
  seq += 1;
  const her = createMember({ name: "أ", phone: "+97250555" + seq + "00", notes: "" })!;
  assert.equal(mergeMembers(her.id, her.id).ok, false);
});

test("every table that points at a member is accounted for by the merge", async () => {
  const { getDb } = await import("@/app/lib/db");
  const db = getDb();

  // Walk the real schema rather than a list somebody remembered to update.
  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{
      name: string;
    }>
  ).map((row) => row.name);

  const pointingAtMembers = tables.filter((table) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
      (column) => column.name === "member_id"
    )
  );

  // The three with rules of their own, handled explicitly in mergeMembers.
  const handledSeparately = ["member_groups", "journey_enrollments", "journey_sends"];
  const source = readFileSync(new URL("../app/lib/db.ts", import.meta.url), "utf8");
  const listed = (source.match(/const MEMBER_TABLES = \[([^\]]+)\]/)?.[1] ?? "")
    .split(",")
    .map((name) => name.trim().replace(/['"]/g, ""))
    .filter(Boolean);

  for (const table of pointingAtMembers) {
    assert.ok(
      listed.includes(table) || handledSeparately.includes(table),
      `«${table}» has a member_id and the merge would leave its rows pointing at a deleted record`
    );
  }
});

test("a label she refused under the old record is still refused", async () => {
  const { createGroup, createMember, getDb, mergeMembers } = await import("@/app/lib/db");
  seq += 1;
  const keep = createMember({ name: "أ", phone: "+97250666" + seq + "00", notes: "" })!;
  const drop = createMember({ name: "ب", phone: "+97250777" + seq + "00", notes: "" })!;
  const label = createGroup(`ملصق ${seq}`);

  getDb()
    .prepare("INSERT OR IGNORE INTO label_refusals (member_id, group_id) VALUES (?, ?)")
    .run(drop.id, label.id);

  mergeMembers(keep.id, drop.id);

  const kept = getDb()
    .prepare("SELECT COUNT(*) AS n FROM label_refusals WHERE member_id = ?")
    .get(keep.id) as { n: number };
  assert.equal(kept.n, 1, "a «no» she gave does not disappear because her record was merged");

  const orphan = getDb()
    .prepare("SELECT COUNT(*) AS n FROM label_refusals WHERE member_id = ?")
    .get(drop.id) as { n: number };
  assert.equal(orphan.n, 0);
});
