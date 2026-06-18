import { NextResponse } from "next/server";
import { createMessage, findOrCreateMemberByPhone, updateMessageStatusByWhatsAppId, type Message } from "@/app/lib/db";
import { createStoredMediaFilename, formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_LABEL, writeMediaFile } from "@/app/lib/media-store";
import { downloadWhatsAppMedia, getWhatsAppMediaInfo } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

type IncomingMedia = {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  sha256?: string;
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id?: string;
          profile?: { name?: string };
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: "text" | "image" | "video" | "document" | string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; caption?: string; sha256?: string };
          video?: { id?: string; mime_type?: string; caption?: string; sha256?: string };
          document?: { id?: string; mime_type?: string; caption?: string; filename?: string; sha256?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: "sent" | "delivered" | "read" | "failed";
          errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
        }>;
      };
    }>;
  }>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: Request) {
  const payload = (await request.json()) as WhatsAppWebhookPayload;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const contactsByWaId = new Map(
        (value?.contacts ?? []).map((contact) => [
          contact.wa_id,
          contact.profile?.name
        ])
      );

      for (const incoming of value?.messages ?? []) {
        if (!incoming.from) {
          continue;
        }

        const member = findOrCreateMemberByPhone({
          phone: incoming.from,
          profileName: contactsByWaId.get(incoming.from)
        });

        if (incoming.type === "text" && incoming.text?.body) {
          createMessage({
            memberId: member.id,
            direction: "incoming",
            messageType: "text",
            body: incoming.text.body,
            whatsappMessageId: incoming.id ?? null,
            status: "received"
          });
          continue;
        }

        if (incoming.type === "image" || incoming.type === "video" || incoming.type === "document") {
          const media = incoming[incoming.type] as IncomingMedia | undefined;
          if (!media?.id) {
            continue;
          }

          try {
            const mediaInfo = await getWhatsAppMediaInfo(media.id);
            if (mediaInfo.file_size && mediaInfo.file_size > MAX_MEDIA_BYTES) {
              createMessage({
                memberId: member.id,
                direction: "incoming",
                messageType: incoming.type,
                body: media.caption || `Incoming ${incoming.type}`,
                whatsappMessageId: incoming.id ?? null,
                status: "failed",
                error: `This file is ${formatBytes(mediaInfo.file_size)}. The maximum supported size is ${MAX_MEDIA_LABEL}.`
              });
              continue;
            }

            const bytes = await downloadWhatsAppMedia(mediaInfo.url);
            const storedFilename = createStoredMediaFilename({
              messageId: incoming.id ?? media.id,
              mimeType: media.mime_type || mediaInfo.mime_type,
              originalName: incoming.type === "document" ? media.filename : undefined
            });
            const mediaUrl = writeMediaFile(storedFilename, bytes);
            const filename = incoming.type === "document" ? media.filename ?? storedFilename : storedFilename;

            createMessage({
              memberId: member.id,
              direction: "incoming",
              messageType: incoming.type,
              body: media.caption || filename,
              whatsappMessageId: incoming.id ?? null,
              status: "received",
              mediaUrl,
              mediaMimeType: media.mime_type || mediaInfo.mime_type,
              mediaFilename: filename
            });
          } catch (error) {
            createMessage({
              memberId: member.id,
              direction: "incoming",
              messageType: incoming.type,
              body: media.caption || `Incoming ${incoming.type}`,
              whatsappMessageId: incoming.id ?? null,
              status: "failed",
              error: error instanceof Error ? error.message : "Could not download incoming media."
            });
          }
        }
      }

      for (const statusUpdate of value?.statuses ?? []) {
        if (!statusUpdate.id || !statusUpdate.status) {
          continue;
        }

        const error = statusUpdate.errors?.[0];
        const errorText = error
          ? [error.title, error.message, error.error_data?.details].filter(Boolean).join(" - ")
          : null;

        updateMessageStatusByWhatsAppId(statusUpdate.id, {
          status: statusUpdate.status as Message["status"],
          error: errorText
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
