import {
  campaignSentTotals,
  createMessage,
  getCampaign,
  getGroup,
  listGroupMembers,
  failedAttempts,
  initiatedToday,
  listMemberIdsWithOutgoingBody,
  listRunnableCampaigns,
  markCampaignRun,
  recordCampaignRun,
  updateMessageStatus,
  updateCampaignStatus,
  type Campaign
} from "./db";
import {
  fillNameToken,
  getMessagingLimit,
  renderTemplateBody,
  sendWhatsAppTemplate,
  sendWhatsAppText
} from "./whatsapp";
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

/** A send refused this many times for one member is not tried again. */
const MAX_ATTEMPTS = 3;

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
  // A refused send is retried — that is the point of not counting it as
  // delivered — but not for ever: a number that can never receive this
  // would otherwise come back every minute and keep the send alive with
  // nothing left to do.
  const reachable = members.filter(
    (member) => !already.has(member.id) && failedAttempts(storedBody, member.id) < MAX_ATTEMPTS
  );
  const targets = reachable;
  // Never exceed the current Meta allowance, even if the campaign was created
  // when the tier was higher.
  const limit = await getMessagingLimit();

  // «now» drains the group a slice at a time, every minute, until it is
  // done — so its ceiling is what one run can finish, not what the day
  // allows. The day is still counted: the runs are summed so a send of
  // thousands cannot walk past Meta's allowance one minute at a time.
  const perRun =
    campaign.repeatMode === "now"
      ? Math.max(0, Math.min(120, campaign.dailyLimit, limit.dailyLimit - initiatedToday()))
      : Math.min(campaign.dailyLimit, limit.dailyLimit);
  const batch = targets.slice(0, perRun);

  markCampaignRun(campaign.id);

  let sent = 0;
  let failed = 0;

  for (const member of batch) {
    // The body is this member's own copy; the send key is what the campaign
    // was sent from, and is what every "already written to" check compares.
    const params = fillNameToken(campaign.bodyParams, member);
    const body = campaign.mode === "template" ? renderTemplateBody(storedBody, params) : storedBody;
    const pending = createMessage({
      memberId: member.id,
      direction: "outgoing",
      body,
      status: "pending",
      sendKey: storedBody
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

  // A «now» send that could not take anybody this run has hit the day's
  // allowance; it stays active and carries on tomorrow rather than being
  // written off as finished.
  // «Nothing went out» means the day is spent, not that the send is over.
  // But if nobody is left who could still be reached, it *is* over — the
  // ones remaining have been refused their three times.
  const outOfAllowance = campaign.repeatMode === "now" && batch.length === 0 && targets.length > 0;
  if (!outOfAllowance && (remaining === 0 || campaign.repeatMode === "once")) {
    updateCampaignStatus(campaign.id, "done");
  }

  const totals = campaignSentTotals(campaign.id);
  const daysLeft = Math.ceil(remaining / Math.max(1, campaign.dailyLimit));
  const lines = [
    `📤 حملة «${campaign.label || groupName}»`,
    `المجموعة: ${groupName}`,
    `دفعة اليوم: ${sent} انبعتت ✅${failed ? ` · ${failed} فشلت ⚠️` : ""}`,
    remaining > 0 && campaign.repeatMode !== "once"
      ? `الباقي: ${remaining} (~${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"})`
      : remaining > 0
        ? `الباقي: ${remaining} — الحملة كانت إرسال مجدول لمرة واحدة`
        : "🎉 الحملة اكتملت — الكل استلم الرسالة",
    `الإجمالي حتى الآن: ${totals.sent} انبعتت${totals.failed ? ` · ${totals.failed} فشلت` : ""}`
  ];
  await sendTelegramMessage(lines.join("\n"));

  return { sent, failed, remaining };
}

export async function runDueCampaigns(minHoursSinceLastRun = 24, onlyMode?: Campaign["repeatMode"]) {
  if (globalForRunner.__afkarCampaignRunning) {
    return;
  }
  globalForRunner.__afkarCampaignRunning = true;
  try {
    const all = listRunnableCampaigns(minHoursSinceLastRun);
    // The minute-by-minute drain only touches the sends that asked for it;
    // the half-hourly tick leaves them to it.
    const due = onlyMode
      ? all.filter((campaign) => campaign.repeatMode === onlyMode)
      : all.filter((campaign) => campaign.repeatMode !== "now");
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
