import { NextResponse } from "next/server";
import {
  createCampaign,
  getGroup,
  listCampaigns,
  listGroups,
  listGroupSendBodies,
  recordCampaignRun,
  updateCampaignStatus
} from "@/app/lib/db";
import { campaignSendBody } from "@/app/lib/campaigns";

export const runtime = "nodejs";

/** Bulk sends that already went out before manual sends were logged as campaigns. */
export async function GET(request: Request) {
  const groupId = Number(new URL(request.url).searchParams.get("groupId"));
  if (!getGroup(groupId)) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }
  const known = new Set(listCampaigns().filter((c) => c.groupId === groupId).map(campaignSendBody));
  const sends = listGroupSendBodies(groupId).map((send) => ({ ...send, logged: known.has(send.body) }));
  return NextResponse.json({ sends });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { groupId?: number; body?: string };
  // No groupId means "rebuild everything we can find" — used by the button in Campaigns.
  const groups = body.groupId
    ? [getGroup(Number(body.groupId))].filter((group): group is NonNullable<typeof group> => Boolean(group))
    : listGroups();
  if (!groups.length) {
    return NextResponse.json({ error: "Group not found." }, { status: 404 });
  }

  const created = groups.flatMap((group) => backfillGroup(group, body.body));

  return NextResponse.json({ created: created.filter(Boolean) });
}

function backfillGroup(group: { id: number; name: string }, onlyBody?: string) {
  const groupId = group.id;
  const known = new Set(listCampaigns().filter((c) => c.groupId === groupId).map(campaignSendBody));
  const candidates = listGroupSendBodies(groupId).filter(
    (send) => !known.has(send.body) && (!onlyBody || send.body === onlyBody)
  );

  return candidates.map((send) => {
    const campaign = createCampaign({
      groupId,
      label: `${send.body.slice(0, 40)}${send.body.length > 40 ? "…" : ""} → ${group.name}`,
      mode: "template",
      bodyPreview: send.body,
      dailyLimit: Math.max(1, send.recipients),
      repeatMode: "once"
    });
    if (!campaign) return null;
    updateCampaignStatus(campaign.id, "done");
    recordCampaignRun({ campaignId: campaign.id, sent: send.sent, failed: send.failed, remaining: 0 });
    return { id: campaign.id, group: group.name, recipients: send.recipients, sent: send.sent, failed: send.failed };
  });
}
