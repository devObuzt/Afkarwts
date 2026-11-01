import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

/**
 * اللي شافه وسام على الشاشة: «انبعتت لـ0 من 0» على حملة بعتت فعلاً.
 *
 * السبب إنّ التقدّم كان بينحسب من **أعضاء المجموعة اليوم**، والمجموعة
 * فضيت بعد ما خلصت الحملة. 385 حملة مستوردة كانت كلها بتقرا صفر وهي
 * بعتت 35,504 رسالة.
 */
test("الحملة المنتهية بتقول شو بعتت فعلاً، مش شو بقي بمجموعتها اليوم", async () => {
  const { createGroup, createCampaign, updateCampaignStatus, recordCampaignRun, getCampaign } = await import(
    "@/app/lib/db"
  );
  const { campaignProgress } = await import("@/app/lib/campaigns");
  seq += 1;

  const group = createGroup(`تاريخ ${seq}`); // فاضية بالمقصود
  const campaign = createCampaign({
    groupId: group.id,
    label: "حملة قديمة",
    mode: "template",
    bodyPreview: "مراحب يا رفاق",
    dailyLimit: 250,
    repeatMode: "once"
  })!;
  updateCampaignStatus(campaign.id, "done");
  recordCampaignRun({ campaignId: campaign.id, sent: 34, failed: 3, remaining: 0 });

  const progress = campaignProgress(getCampaign(campaign.id)!);

  assert.equal(progress.delivered, 34, "🔑 العدد من سجل التشغيل مش من المجموعة");
  assert.equal(progress.total, 37, "اللي انجرّب = اللي وصل + اللي فشل");
  assert.equal(progress.failed, 3);
  assert.equal(progress.remaining, 0, "المنتهية ما إلها باقي");
});

test("الحملة الشغّالة بتضل تنحسب من مجموعتها", async () => {
  const { createGroup, createMember, addMembersToGroup, createCampaign, getCampaign } = await import("@/app/lib/db");
  const { campaignProgress } = await import("@/app/lib/campaigns");
  seq += 1;

  const group = createGroup(`شغّالة ${seq}`);
  const people = [1, 2, 3].map(
    (n) => createMember({ name: `و${n}`, phone: `+9725299${seq}${n}000`, notes: "" })!
  );
  addMembersToGroup(group.id, people.map((p) => p.id));
  const campaign = createCampaign({
    groupId: group.id,
    label: "شغّالة",
    mode: "template",
    bodyPreview: "نص",
    dailyLimit: 250,
    repeatMode: "once"
  })!;

  const progress = campaignProgress(getCampaign(campaign.id)!);
  assert.equal(progress.total, 3);
  assert.equal(progress.remaining, 3);
});

/** الصفحة بتجيب 30، والاستيراد لازم يشوف الكل وإلا بيعمل مكرّرات. */
test("الصفحة بتجيب 30 · والاستيراد بيشوف كل حملات المجموعة", async () => {
  const { createGroup, createCampaign, listCampaigns, listCampaignsForGroup, countCampaigns } = await import(
    "@/app/lib/db"
  );
  seq += 1;
  const group = createGroup(`كتير ${seq}`);
  for (let n = 0; n < 35; n += 1) {
    createCampaign({
      groupId: group.id,
      label: `ح${n}`,
      mode: "template",
      bodyPreview: `نص ${seq}-${n}`,
      dailyLimit: 250,
      repeatMode: "once"
    });
  }

  assert.equal(listCampaigns().length, 30, "صفحة وحدة");
  assert.equal(listCampaigns({ offset: 30 }).length > 0, true, "والباقي بالصفحة الجاية");
  assert.ok(countCampaigns() >= 35);
  assert.equal(listCampaignsForGroup(group.id).length, 35, "🔑 الاستيراد بيشوف الكل");
});
