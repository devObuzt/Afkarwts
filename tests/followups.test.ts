import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("Israeli mobiles are recognised and others are not", async () => {
  const { isIsraeliMobile } = await import("@/app/lib/sms-format");

  assert.equal(isIsraeliMobile("+972526805262"), true);
  assert.equal(isIsraeliMobile("972526805262"), true);
  assert.equal(isIsraeliMobile("+970598123456"), false);
  assert.equal(isIsraeliMobile("+97226805262"), false); // a landline
});

test("Arabic text is counted at 70 characters per message", async () => {
  const { smsSegments } = await import("@/app/lib/sms-format");

  assert.deepEqual(smsSegments("مرحبا"), { characters: 5, segments: 1 });
  assert.equal(smsSegments("ا".repeat(70)).segments, 1);
  assert.equal(smsSegments("ا".repeat(71)).segments, 2);
  assert.equal(smsSegments("a".repeat(160)).segments, 1);
  assert.equal(smsSegments("a".repeat(161)).segments, 2);
});

test("a stop opens a manual task, and an SMS item only for an Israeli mobile", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { openFollowupsForStop, listFollowups } = await import("@/app/lib/journeys/followups");

  const israeli = createMember({ name: "سارة", phone: "+972526805262", notes: "" })!;
  const palestinian = createMember({ name: "ليلى", phone: "+970598123456", notes: "" })!;

  openFollowupsForStop({ enrollmentId: null, memberId: israeli.id, reason: "not_read", smsText: "تواصلي معنا" });
  openFollowupsForStop({ enrollmentId: null, memberId: palestinian.id, reason: "not_read", smsText: "تواصلي معنا" });

  const manual = listFollowups({ kind: "manual" });
  const sms = listFollowups({ kind: "sms" });

  assert.equal(manual.length, 2);
  assert.equal(sms.length, 1);
  assert.equal(sms[0].memberId, israeli.id);
  assert.ok(manual.find((item) => item.memberId === palestinian.id)?.reason.includes("مش إسرائيلي"));
});

test("an undeliverable number is told which country code to try", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { openFollowupsForStop, listFollowups } = await import("@/app/lib/journeys/followups");

  const member = createMember({ name: "هالة", phone: "+970598111222", notes: "" })!;
  openFollowupsForStop({ enrollmentId: null, memberId: member.id, reason: "send_failed", smsText: "تواصلي معنا" });

  const task = listFollowups({ kind: "manual" }).find((item) => item.memberId === member.id);
  assert.ok(task?.reason.includes("+972598111222"));
});

test("the queue is held outside sending hours", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { openFollowupsForStop, listFollowups, drainSmsQueue } = await import("@/app/lib/journeys/followups");

  const member = createMember({ name: "هدى", phone: "+972526805263", notes: "" })!;
  openFollowupsForStop({ enrollmentId: null, memberId: member.id, reason: "not_read", smsText: "تواصلي معنا" });

  // Earlier tests share this database, so the queue is measured, not assumed.
  const queued = listFollowups({ kind: "sms", state: "queued" }).length;

  const night = await drainSmsQueue(new Date("2026-09-13T01:00:00.000Z")); // 04:00 Israel time
  assert.equal(night.sent, 0);
  assert.equal(night.held, queued);
  assert.equal(listFollowups({ kind: "sms", state: "queued" }).length, queued, "nothing left the queue at night");

  const day = await drainSmsQueue(new Date("2026-09-13T09:00:00.000Z")); // 12:00 Israel time
  assert.equal(day.sent, queued);

  const mine = listFollowups({ kind: "sms" }).find((item) => item.memberId === member.id);
  assert.equal(mine?.state, "sent");
  // SMS_PROVIDER is unset, so this was simulated rather than sent.
  assert.match(mine?.providerRef ?? "", /^sms\./);
});

test("a resolved manual task records the note", async () => {
  const { createMember } = await import("@/app/lib/db");
  const { openFollowupsForStop, listFollowups, resolveManual } = await import("@/app/lib/journeys/followups");

  const member = createMember({ name: "رنا", phone: "+972526805264", notes: "" })!;
  openFollowupsForStop({ enrollmentId: null, memberId: member.id, reason: "not_delivered", smsText: "" });

  const task = listFollowups({ kind: "manual" }).find((item) => item.memberId === member.id)!;
  resolveManual(task.id, "حكيت معها بالتلفون");

  const done = listFollowups({ kind: "manual", state: "done" }).find((item) => item.id === task.id);
  assert.equal(done?.note, "حكيت معها بالتلفون");
});
