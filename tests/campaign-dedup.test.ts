import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "clean_week";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "ar";
delete process.env.WHATSAPP_WABA_ID;
delete process.env.TELEGRAM_BOT_TOKEN;

let seq = 0;

async function cohort(size: number) {
  const { createMember, createGroup, addMembersToGroup } = await import("@/app/lib/db");
  seq += 1;
  const group = createGroup(`حملة ${seq}`);
  const names = ["سارة حاج", "ليلى نصار", "هدى عمر"].slice(0, size);
  const ids = names.map((name, index) =>
    createMember({ name, phone: `+97251${seq}0000${index}`, notes: "" })!.id
  );
  addMembersToGroup(group.id, ids);
  return { group, ids };
}

test("a campaign personalises the body and still never sends twice", async () => {
  const { createCampaign, listMessages } = await import("@/app/lib/db");
  const { runCampaignBatch } = await import("@/app/lib/campaigns");
  const { group, ids } = await cohort(2);

  const campaign = createCampaign({
    groupId: group.id,
    label: "فحص",
    mode: "template",
    text: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: ["{{name}}"],
    bodyPreview: "سلام {{1}}، اسبوع كلين رح يبلش.",
    dailyLimit: 50,
    repeatMode: "daily"
  });

  const first = await runCampaignBatch(campaign.id);
  assert.equal(first?.sent, 2);

  // Each thread shows that member's own name, not the raw template.
  assert.equal(listMessages(ids[0])[0].body, "سلام سارة، اسبوع كلين رح يبلش.");
  assert.equal(listMessages(ids[1])[0].body, "سلام ليلى، اسبوع كلين رح يبلش.");

  // The guard that stops a group being written to twice still holds, even
  // though no two stored bodies are alike any more.
  const second = await runCampaignBatch(campaign.id);
  assert.equal(second?.sent ?? 0, 0);
  assert.equal(listMessages(ids[0]).length, 1);
});

test("messages sent before the send key existed still count as sent", async () => {
  const { createCampaign, createMessage, listMemberIdsWithOutgoingBody } = await import("@/app/lib/db");
  const { runCampaignBatch } = await import("@/app/lib/campaigns");
  const { group, ids } = await cohort(2);

  const body = "رسالة قديمة بلا مفتاح";
  // A row as the old code wrote them: body only, no send key.
  createMessage({ memberId: ids[0], direction: "outgoing", body, status: "accepted" });
  assert.ok(listMemberIdsWithOutgoingBody(body).has(ids[0]));

  const campaign = createCampaign({
    groupId: group.id,
    label: "قديم",
    mode: "text",
    text: body,
    templateName: null,
    templateLanguage: null,
    bodyParams: [],
    bodyPreview: "",
    dailyLimit: 50,
    repeatMode: "daily"
  });

  const run = await runCampaignBatch(campaign.id);
  assert.equal(run?.sent, 1, "only the member who had not received it");
});

test("past sends stay grouped as one send even when personalised", async () => {
  const { createCampaign, listGroupSendBodies } = await import("@/app/lib/db");
  const { runCampaignBatch } = await import("@/app/lib/campaigns");
  const { group } = await cohort(3);

  const campaign = createCampaign({
    groupId: group.id,
    label: "تجميع",
    mode: "template",
    text: "",
    templateName: "clean_week",
    templateLanguage: "ar",
    bodyParams: ["{{name}}"],
    bodyPreview: "أهلا {{1}}",
    dailyLimit: 50,
    repeatMode: "once"
  });

  await runCampaignBatch(campaign.id);

  // Three different stored bodies, but one send.
  const sends = listGroupSendBodies(group.id, 2);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].recipients, 3);
  assert.equal(sends[0].body, "أهلا {{1}}");
});
