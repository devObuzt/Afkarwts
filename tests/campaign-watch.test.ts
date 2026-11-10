import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("التقرير بيجمّع الفشل بسبب مفهوم مش برمز ميتا", async () => {
  const { createGroup, createMember, addMembersToGroup, createCampaign, createMessage } = await import(
    "@/app/lib/db"
  );
  const { campaignSendBody } = await import("@/app/lib/campaigns");
  const { reportFor, formatReport } = await import("@/app/lib/campaign-watch");

  const group = createGroup(`حملة ${Date.now()}`);
  const people = [1, 2, 3].map((n) =>
    createMember({ name: `و${n}`, phone: `+97252111030${n}` })
  );
  addMembersToGroup(group.id, people.map((person) => person.id));

  const campaign = createCampaign({
    groupId: group.id,
    label: "بلاك فرايدي تجربة",
    mode: "template",
    text: "",
    templateName: "afkar_blackfriday_2026",
    templateLanguage: "ar",
    bodyParams: [],
    bodyPreview: "عرض بلاك فرايدي",
    dailyLimit: 100,
    repeatMode: "now"
  })!;

  const sendKey = campaignSendBody(campaign);
  createMessage({ memberId: people[0].id, direction: "outgoing", body: sendKey, status: "sent", sendKey });
  createMessage({
    memberId: people[1].id,
    direction: "outgoing",
    body: sendKey,
    status: "failed",
    error: "Message undeliverable",
    sendKey
  });

  const report = reportFor(campaign);
  assert.equal(report.delivered, 1, "اللي انبعتله بينحسب");
  assert.equal(report.failed, 1);
  assert.ok(report.reasons.length >= 1);
  // 🔑 «Message undeliverable» ما بتقول للواحد شو يعمل — التقرير بيترجمها.
  assert.notEqual(report.reasons[0].title, "Message undeliverable");

  const text = formatReport(report);
  assert.match(text, /انبعت: 1 من 3/);
  assert.match(text, /فشل: 1/);
});

test("ما بيبعت مرتين على نفس الرقم", async () => {
  const { createGroup, createMember, addMembersToGroup, createCampaign } = await import("@/app/lib/db");
  const { reportActiveCampaigns } = await import("@/app/lib/campaign-watch");

  const group = createGroup(`هدوء ${Date.now()}`);
  const person = createMember({ name: "واحدة", phone: "+972521110399" });
  addMembersToGroup(group.id, [person.id]);
  createCampaign({
    groupId: group.id,
    label: "هدوء",
    mode: "template",
    text: "",
    templateName: "t",
    templateLanguage: "ar",
    bodyParams: [],
    bodyPreview: `هدوء ${Date.now()}`,
    dailyLimit: 10,
    repeatMode: "now"
  });

  const first = await reportActiveCampaigns();
  assert.ok(first.length >= 1, "أول مرة بتتقرّر");
  const second = await reportActiveCampaigns();
  // الضجيج بيخلّي الواحد يوقف يقرا، وساعتها بتضيع التقارير اللي بتعني إشي.
  assert.equal(second.length, 0, "ما تغيّر إشي ← ما بينبعت");
});
