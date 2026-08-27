import { NextResponse } from "next/server";
import { getCampaign, getGroup, listCampaignRecipients, listCampaignRuns } from "@/app/lib/db";
import { campaignSendBody } from "@/app/lib/campaigns";

export const runtime = "nodejs";

const DELIVERED = new Set(["accepted", "sent", "delivered", "read"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = Number((await params).id);
  const campaign = Number.isInteger(campaignId) ? getCampaign(campaignId) : null;

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const recipients = listCampaignRecipients(campaign.groupId, campaignSendBody(campaign));

  return NextResponse.json({
    campaign: { ...campaign, groupName: getGroup(campaign.groupId)?.name ?? "" },
    runs: listCampaignRuns(campaign.id),
    delivered: recipients.filter((r) => r.status && DELIVERED.has(r.status)),
    failed: recipients.filter((r) => r.status === "failed"),
    pending: recipients.filter((r) => !r.status || r.status === "pending")
  });
}
