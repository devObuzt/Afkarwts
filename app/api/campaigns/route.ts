import { NextResponse } from "next/server";
import { createCampaign, getGroup, listCampaigns, listGroupMembers } from "@/app/lib/db";
import { campaignProgress, runCampaignBatch } from "@/app/lib/campaigns";
import { getMessagingLimit } from "@/app/lib/whatsapp";

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
      startsAt?: string | null;
      repeatMode?: "once" | "daily" | "weekly";
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

    const limit = await getMessagingLimit();
    const dailyLimit = Math.min(Math.max(1, Number(body.dailyLimit) || limit.suggested), limit.dailyLimit);
    const label = mode === "template" ? body.templateName || "template" : "free text";

    const startsAt = body.startsAt ? new Date(body.startsAt) : null;
    if (body.startsAt && Number.isNaN(startsAt?.getTime())) {
      return NextResponse.json({ error: "Invalid schedule date." }, { status: 400 });
    }
    const repeatMode = body.repeatMode ?? "daily";
    const scheduled = Boolean(startsAt && startsAt.getTime() > Date.now());

    const campaign = createCampaign({
      groupId,
      label: `${label} → ${group.name}`,
      mode,
      text: body.text?.trim(),
      templateName: body.templateName ?? null,
      templateLanguage: body.templateLanguage ?? null,
      bodyParams: body.bodyParams ?? [],
      bodyPreview: body.bodyPreview ?? "",
      dailyLimit,
      startsAt: startsAt ? startsAt.toISOString() : null,
      repeatMode
    });

    if (!campaign) {
      return NextResponse.json({ error: "Could not create campaign." }, { status: 500 });
    }

    const progress = campaignProgress(campaign);

    // A scheduled campaign waits for its start time; otherwise the first batch
    // fires in the background so the request returns instantly.
    if (!scheduled) {
      void runCampaignBatch(campaign.id).catch((error) =>
        console.error(`First run of campaign ${campaign.id} failed:`, error)
      );
    }

    return NextResponse.json(
      {
        campaign: { ...campaign, groupName: group.name, progress },
        scheduled,
        estimatedDays: Math.ceil(progress.remaining / dailyLimit)
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
