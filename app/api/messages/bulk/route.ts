import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import {
  createCampaign,
  createMessage,
  getGroup,
  getMember,
  listGroupMembers,
  listMemberIdsWithOutgoingBody,
  recordCampaignRun,
  updateCampaignStatus,
  updateMessageStatus
} from "@/app/lib/db";
import {
  fillNameToken,
  getMessagingLimit,
  renderTemplateBody,
  sendWhatsAppTemplate,
  sendWhatsAppText
} from "@/app/lib/whatsapp";
import { groupSendable } from "@/app/lib/labels/sendable";

export const runtime = "nodejs";
export const maxDuration = 300;

type BulkResult = {
  memberId: number;
  name: string;
  phone: string;
  ok: boolean;
  error: string | null;
};

export async function POST(request: Request) {
  const auth = await requireApi("messages.send");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as {
      groupId?: number;
      memberIds?: number[];
      mode?: "template" | "text";
      text?: string;
      templateName?: string;
      templateLanguage?: string;
      bodyParams?: string[];
      bodyPreview?: string;
      skipAlreadySent?: boolean;
      /** Hand it to the server instead of sending inside this request. */
      background?: boolean;
      maxRecipients?: number;
    };

    const mode = body.mode === "text" ? "text" : "template";
    const text = body.text?.trim() ?? "";
    const bodyParams = (body.bodyParams ?? []).map((param) => String(param));
    const templateStoredBody =
      body.bodyPreview?.trim() ||
      (body.templateName ? `Template: ${body.templateName}` : "Template message");

    if (mode === "text" && !text) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    let members = [] as ReturnType<typeof listGroupMembers>;
    let group: ReturnType<typeof getGroup> = null;

    if (body.groupId) {
      const groupId = Number(body.groupId);
      group = getGroup(groupId);
      if (!group) {
        return NextResponse.json({ error: "Group not found." }, { status: 404 });
      }
      // A مسار and the invoice-contacts label are not mailing lists; naming
      // people one at a time is still allowed, because that is a decision
      // about a person rather than a send to a list.
      const sendable = groupSendable(groupId);
      if (!sendable.ok) {
        return NextResponse.json({ error: sendable.error }, { status: 400 });
      }
      members = listGroupMembers(groupId);
    } else if (body.memberIds?.length) {
      members = body.memberIds
        .map((id) => getMember(Number(id)))
        .filter((member): member is NonNullable<typeof member> => Boolean(member));
    }

    const totalInGroup = members.length;
    const sendBody = mode === "template" ? templateStoredBody : text;

    let skipped = 0;
    if (body.skipAlreadySent !== false && sendBody) {
      const alreadySent = listMemberIdsWithOutgoingBody(sendBody);
      const before = members.length;
      members = members.filter((member) => !alreadySent.has(member.id));
      skipped = before - members.length;
    }

    // A send too big for one request does not belong in a request at all.
    // It becomes a campaign the server drains every minute until the group
    // is done — so a closed tab, a dropped connection or a laptop lid
    // makes no difference to it. Wisam asked exactly this: «ليش لازم تضل
    // الشاشة مفتوحة واذا قطع النت».
    if (body.background && group) {
      // Clamped here too: what the screen asks for is a wish, and the
      // day's allowance is not.
      const allowance = await getMessagingLimit();
      const asked = Math.max(1, Number(body.maxRecipients) || members.length);
      const job = createCampaign({
        groupId: group.id,
        label: `${mode === "template" ? body.templateName || "template" : "free text"} → ${group.name}`,
        mode,
        text,
        templateName: body.templateName ?? null,
        templateLanguage: body.templateLanguage ?? null,
        bodyParams,
        bodyPreview: body.bodyPreview ?? "",
        dailyLimit: Math.min(asked, allowance.dailyLimit),
        repeatMode: "now"
      });
      return NextResponse.json({
        background: true,
        campaignId: job?.id ?? null,
        total: members.length,
        skipped
      });
    }

    const limit = await getMessagingLimit();
    const maxRecipients = Math.min(
      Math.max(1, Number(body.maxRecipients) || limit.suggested),
      limit.dailyLimit
    );
    // One request cannot carry a whole group. Each message is its own
    // round trip to Meta — about a second — so 3,746 of them is twenty
    // minutes against a five-minute ceiling, and the send died with
    // «Bulk send failed» after working for five of those minutes.
    //
    // So a request takes a slice it can finish, says how many are left,
    // and the screen comes straight back for the next one. The daily
    // limit still governs the whole send; this only governs one trip.
    // Each send is about 1.6 seconds against Meta. 250 of them is 400
    // seconds against a 300-second ceiling — which is exactly where a send
    // died after 183 had gone out and the screen said «failed».
    const PER_REQUEST = 100;
    const thisBatch = Math.min(maxRecipients, PER_REQUEST);
    const remainingAfterBatch = Math.max(0, members.length - thisBatch);
    members = members.slice(0, thisBatch);

    if (!members.length) {
      return NextResponse.json(
        skipped > 0
          ? { sent: 0, failed: 0, skipped, remaining: 0, results: [], done: true }
          : { error: "No recipients found." },
        { status: skipped > 0 ? 200 : 400 }
      );
    }

    // A manual send is logged as a one-off campaign so it shows up in Campaigns
    // with its batch history and the members who did not get it.
    const campaign = group
      ? createCampaign({
          groupId: group.id,
          label: `${mode === "template" ? body.templateName || "template" : "free text"} → ${group.name}`,
          mode,
          text,
          templateName: body.templateName ?? null,
          templateLanguage: body.templateLanguage ?? null,
          bodyParams,
          bodyPreview: body.bodyPreview ?? "",
          dailyLimit: maxRecipients,
          repeatMode: "once"
        })
      : null;
    // Closed straight away so the daily runner never picks up a manual send.
    if (campaign) {
      updateCampaignStatus(campaign.id, "done");
    }

    const results: BulkResult[] = [];

    for (const member of members) {
      // Stored as this member saw it, keyed by what the send was made from.
      const params = fillNameToken(bodyParams, member);
      const pending = createMessage({
        memberId: member.id,
        direction: "outgoing",
        body: mode === "template" ? renderTemplateBody(templateStoredBody, params) : text,
        status: "pending",
        sendKey: sendBody
      });

      try {
        if (mode === "template") {
          const sent = await sendWhatsAppTemplate(member, {
            name: body.templateName,
            language: body.templateLanguage,
            bodyParams
          });
          updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId: sent.messageId });
        } else {
          const whatsappMessageId = await sendWhatsAppText(member, text);
          updateMessageStatus(pending.id, { status: "accepted", whatsappMessageId });
        }
        results.push({ memberId: member.id, name: member.name, phone: member.phone, ok: true, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : "WhatsApp send failed.";
        updateMessageStatus(pending.id, { status: "failed", error: message });
        results.push({ memberId: member.id, name: member.name, phone: member.phone, ok: false, error: message });
      }
    }

    const sent = results.filter((result) => result.ok).length;
    if (campaign) {
      recordCampaignRun({
        campaignId: campaign.id,
        sent,
        failed: results.length - sent,
        remaining: remainingAfterBatch
      });
    }
    return NextResponse.json({
      sent,
      failed: results.length - sent,
      skipped,
      remaining: remainingAfterBatch,
      total: totalInGroup,
      results
    });
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
