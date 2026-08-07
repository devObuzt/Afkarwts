import { NextResponse } from "next/server";
import { createCampaign, getGroup, listCampaigns, listGroupMembers } from "@/app/lib/db";
import { campaignProgress, runCampaignBatch } from "@/app/lib/campaigns";

export const runtime = "nodejs";

export async function GET() {
  const campaigns = listCampaigns().map((campaign) => {
    const group = getGroup(campaign.groupId);
    return {
      ...campaign,
      groupName: group?.name ?? `#${campaign.groupId}`,
      progress: campaignProgress(campaign)
    };
  });
  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      groupId?: number;
      mode?: "template" | "text";
      text?: string;
      templateName?: string;
      templateLanguage?: string;
      bodyParams?: string[];
      bodyPreview?: string;
      dailyLimit?: number;
    };

    const groupId = Number(body.groupId);
    const group = groupId ? getGroup(groupId) : null;
    if (!group) {
      return NextResponse.json({ error: "Group not found." }, { status: 404 });
    }

    const mode = body.mode === "text" ? "text" : "template";
    if (mode === "text" && !body.text?.trim()) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    if (!listGroupMembers(groupId).length) {
      return NextResponse.json({ error: "This group has no members." }, { status: 400 });
    }

    const dailyLimit = Math.min(Math.max(1, Number(body.dailyLimit) || 250), 1000);
    const label = mode === "template" ? body.templateName || "template" : "free text";

    const campaign = createCampaign({
      groupId,
      label: `${label} → ${group.name}`,
      mode,
      text: body.text?.trim(),
      templateName: body.templateName ?? null,
      templateLanguage: body.templateLanguage ?? null,
      bodyParams: body.bodyParams ?? [],
      bodyPreview: body.bodyPreview ?? "",
      dailyLimit
    });

    if (!campaign) {
      return NextResponse.json({ error: "Could not create campaign." }, { status: 500 });
    }

    const progress = campaignProgress(campaign);

    // First batch fires in the background so the request returns instantly.
    void runCampaignBatch(campaign.id).catch((error) =>
      console.error(`First run of campaign ${campaign.id} failed:`, error)
    );

    return NextResponse.json(
      {
        campaign: { ...campaign, groupName: group.name, progress },
        estimatedDays: Math.ceil(progress.remaining / dailyLimit)
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
