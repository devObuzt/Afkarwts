import {
  campaignSentTotals,
  createMessage,
  getCampaign,
  getGroup,
  listGroupMembers,
  listMemberIdsWithOutgoingBody,
  listRunnableCampaigns,
  markCampaignRun,
  recordCampaignRun,
  updateMessageStatus,
  updateCampaignStatus,
  type Campaign
} from "./db";
import { getMessagingLimit, sendWhatsAppTemplate, sendWhatsAppText } from "./whatsapp";
import { sendTelegramMessage } from "./telegram";

const globalForRunner = globalThis as typeof globalThis & {
  __afkarCampaignRunning?: boolean;
};

export function campaignSendBody(campaign: Campaign) {
  if (campaign.mode === "text") {
    return campaign.text;
  }
  return campaign.bodyPreview || (campaign.templateName ? `Template: ${campaign.templateName}` : "Template message");
}

export function campaignProgress(campaign: Campaign) {
  const members = listGroupMembers(campaign.groupId);
  const already = listMemberIdsWithOutgoingBody(campaignSendBody(campaign));
  const delivered = members.filter((member) => already.has(member.id)).length;
  const remaining = members.length - delivered;
  const daysLeft = campaign.status === "done" ? 0 : Math.ceil(remaining / Math.max(1, campaign.dailyLimit));
  return { total: members.length, delivered, remaining, daysLeft };
}

export async function runCampaignBatch(campaignId: number) {
  const campaign = getCampaign(campaignId);
  if (!campaign || campaign.status !== "active") {
    return null;
  }

  const group = getGroup(campaign.groupId);
  const groupName = group?.name ?? `#${campaign.groupId}`;
  const storedBody = campaignSendBody(campaign);

  const members = listGroupMembers(campaign.groupId);
  const already = listMemberIdsWithOutgoingBody(storedBody);
  const targets = members.filter((member) => !already.has(member.id));
  // Never exceed the current Meta allowance, even if the campaign was created
  // when the tier was higher.
  const limit = await getMessagingLimit();
  const batch = targets.slice(0, Math.min(campaign.dailyLimit, limit.dailyLimit));

  markCampaignRun(campaign.id);

  let sent = 0;
  let failed = 0;

  for (const member of batch) {
    const pending = createMessage({
      memberId: member.id,
      direction: "outgoing",
      body: storedBody,
      status: "pending"
    });

    try {
      if (campaign.mode === "template") {
        const result = await sendWhatsAppTemplate(member, {
          name: campaign.templateName ?? undefined,
          language: campaign.templateLanguage ?? undefined,
          bodyParams: campaign.bodyParams
        });
        updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId: result.messageId });
      } else {
        const whatsappMessageId = await sendWhatsAppText(member, campaign.text);
        updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId });
      }
      sent += 1;
    } catch (error) {
      updateMessageStatus(pending.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "WhatsApp send failed."
      });
      failed += 1;
    }
  }

  const remaining = targets.length - batch.length;
  recordCampaignRun({ campaignId: campaign.id, sent, failed, remaining });

  if (remaining === 0) {
    updateCampaignStatus(campaign.id, "done");
  }

  const totals = campaignSentTotals(campaign.id);
  const daysLeft = Math.ceil(remaining / Math.max(1, campaign.dailyLimit));
  const lines = [
    `📤 حملة «${campaign.label || groupName}»`,
    `المجموعة: ${groupName}`,
    `دفعة اليوم: ${sent} انبعتت ✅${failed ? ` · ${failed} فشلت ⚠️` : ""}`,
    remaining > 0
      ? `الباقي: ${remaining} (~${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"})`
      : "🎉 الحملة اكتملت — الكل استلم الرسالة",
    `الإجمالي حتى الآن: ${totals.sent} انبعتت${totals.failed ? ` · ${totals.failed} فشلت` : ""}`
  ];
  await sendTelegramMessage(lines.join("\n"));

  return { sent, failed, remaining };
}

export async function runDueCampaigns(minHoursSinceLastRun = 24) {
  if (globalForRunner.__afkarCampaignRunning) {
    return;
  }
  globalForRunner.__afkarCampaignRunning = true;
  try {
    const due = listRunnableCampaigns(minHoursSinceLastRun);
    for (const campaign of due) {
      try {
        await runCampaignBatch(campaign.id);
      } catch (error) {
        console.error(`Campaign ${campaign.id} run failed:`, error);
      }
    }
  } finally {
    globalForRunner.__afkarCampaignRunning = false;
  }
}
