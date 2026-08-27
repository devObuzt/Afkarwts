import { NextResponse } from "next/server";
import {
  findMemberByPhone,
  getCampaign,
  getGroup,
  listCampaignRecipients,
  listCampaignRuns
} from "@/app/lib/db";
import { campaignSendBody } from "@/app/lib/campaigns";
import { alternateCountryCode, classifyFailure } from "@/app/lib/whatsapp-errors";

export const runtime = "nodejs";

const DELIVERED = new Set(["accepted", "sent", "delivered", "read"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);
  const campaign = Number.isInteger(campaignId) ? getCampaign(campaignId) : null;

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const recipients = listCampaignRecipients(campaign.groupId, campaignSendBody(campaign));

  // Every failure carries its reason, and undeliverable ones also carry the
  // same subscriber number under the other country code so it can be fixed.
  const failed = recipients
    .filter((r) => r.status === "failed")
    .map((recipient) => {
      const reason = classifyFailure(recipient.error);
      const alternate = reason.kind === "undeliverable" ? alternateCountryCode(recipient.phone) : null;
      return {
        ...recipient,
        reason,
        alternate,
        // An existing contact on the other code means the number is a duplicate,
        // not a typo — switching it would collide.
        alternateTaken: alternate ? Boolean(findMemberByPhone(alternate)) : false
      };
    });

  return NextResponse.json({
    campaign: { ...campaign, groupName: getGroup(campaign.groupId)?.name ?? "" },
    runs: listCampaignRuns(campaign.id),
    delivered: recipients.filter((r) => r.status && DELIVERED.has(r.status)),
    failed,
    pending: recipients.filter((r) => !r.status || r.status === "pending")
  });
}
