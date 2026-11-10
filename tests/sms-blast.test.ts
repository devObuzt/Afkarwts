import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();
process.env.OPT_OUT_SECRET = "test-secret";
process.env.PUBLIC_BASE_URL = "https://www.afkarheartbeat.com";

test("المقاطع بتنحسب على ترميز العربي مش اللاتيني", async () => {
  const { segments } = await import("@/app/lib/sms/blast");
  // 🔑 العربي بيجبر UCS-2: 70 حرف للواحدة و67 لكل مقطع بالمتعددة —
  // مش 160/153 تبع اللاتيني. الفرق بيضاعف الفاتورة على 5 آلاف رقم.
  assert.equal(segments("أ".repeat(70)), 1);
  assert.equal(segments("أ".repeat(71)), 2);
  assert.equal(segments("أ".repeat(134)), 2);
  assert.equal(segments("أ".repeat(135)), 3);
});

test("كل مستلمة بتاخد رابطها هي", async () => {
  const { renderFor } = await import("@/app/lib/sms/blast");
  const one = renderFor("وقف: {{stop}}", 1);
  const two = renderFor("وقف: {{stop}}", 2);
  assert.notEqual(one, two, "الرابط خاص بكل صف");
  assert.match(one, /\/s\/1\./);
  assert.match(two, /\/s\/2\./);
});

test("الموقّفون بينشالوا، والتكرار بين الملصقات بينشال", async () => {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  const { requestOptOut } = await import("@/app/lib/members/opt-out");
  const { audienceFor } = await import("@/app/lib/sms/blast");

  const a = createGroup(`أ ${Date.now()}`);
  const b = createGroup(`ب ${Date.now()}`);
  const both = createMember({ name: "بالاثنين", phone: "+972521110201" });
  const only = createMember({ name: "بوحدة", phone: "+972521110202" });
  const quiet = createMember({ name: "موقّفة", phone: "+972521110203" });
  addMembersToGroup(a.id, [both.id, only.id, quiet.id]);
  addMembersToGroup(b.id, [both.id]);
  requestOptOut({ memberId: quiet.id, source: "link" });

  const { recipients, stopped } = audienceFor([a.id, b.id]);
  assert.deepEqual(recipients.map((person) => person.id).sort(), [both.id, only.id].sort());
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].id, quiet.id);
});

test("ملصق المسار مرفوض كقائمة إرسال", async () => {
  const { createGroup } = await import("@/app/lib/db");
  const { setLabelKind } = await import("@/app/lib/labels/store");
  const { audienceFor } = await import("@/app/lib/sms/blast");

  const group = createGroup(`مسار ${Date.now()}`);
  setLabelKind(group.id, "path");
  assert.throws(() => audienceFor([group.id]), /مسار مش دفعة/);
});
