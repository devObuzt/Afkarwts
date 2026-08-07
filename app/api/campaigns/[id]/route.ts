import { NextResponse } from "next/server";
import { getCampaign, updateCampaignStatus } from "@/app/lib/db";
import { runCampaignBatch } from "@/app/lib/campaigns";

export const runtime = "nodejs";

function parseCampaignId(id: string) {
  const campaignId = Number(id);
  return Number.isInteger(campaignId) && campaignId > 0 ? campaignId : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const campaignId = parseCampaignId((await params).id);
  if (!campaignId || !getCampaign(campaignId)) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { action?: "pause" | "resume" | "run-now" };

    if (body.action === "pause") {
      return NextResponse.json({ campaign: updateCampaignStatus(campaignId, "paused") });
    }

    if (body.action === "resume") {
      return NextResponse.json({ campaign: updateCampaignStatus(campaignId, "active") });
    }

    if (body.action === "run-now") {
      const campaign = getCampaign(campaignId);
      if (campaign?.status !== "active") {
        return NextResponse.json({ error: "Campaign is not active." }, { status: 400 });
      }
      void runCampaignBatch(campaignId).catch((error) =>
        console.error(`Manual run of campaign ${campaignId} failed:`, error)
      );
      return NextResponse.json({ ok: true, running: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
