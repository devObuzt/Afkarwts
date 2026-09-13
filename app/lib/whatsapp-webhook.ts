import { createMessage, findOrCreateMemberByPhone, updateMessageStatusByWhatsAppId, type Message } from "./db";
import { createStoredMediaFilename, formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_LABEL, writeMediaFile } from "./media-store";
import { downloadWhatsAppMedia, getWhatsAppMediaInfo } from "./whatsapp";
import { messagePreview, sendPushToDevices } from "./push";

type IncomingMedia = {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
  sha256?: string;
  voice?: boolean;
};

export type WhatsAppWebhookPayload = {
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
          type?: "text" | "image" | "video" | "document" | "audio" | string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; caption?: string; sha256?: string };
          video?: { id?: string; mime_type?: string; caption?: string; sha256?: string };
          document?: { id?: string; mime_type?: string; caption?: string; filename?: string; sha256?: string };
          audio?: { id?: string; mime_type?: string; sha256?: string; voice?: boolean };
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

function notifyDevices(memberName: string, type: string, body: string, memberId: number) {
  void sendPushToDevices({
    title: memberName,
    body: messagePreview({ type, body }),
    memberId
  }).catch((error) => console.error("Push notification failed:", error));
}

/**
 * The one place an inbound payload is turned into messages and statuses. The
 * webhook route calls it, and so does the staging simulator, so what is tested
 * off a real Meta webhook is the same code that runs behind one.
 */
export async function handleWebhookPayload(payload: WhatsAppWebhookPayload) {
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
          notifyDevices(member.name, "text", incoming.text.body, member.id);
          continue;
        }

        if (
          incoming.type === "image" ||
          incoming.type === "video" ||
          incoming.type === "document" ||
          incoming.type === "audio"
        ) {
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
            const audioLabel = media.voice ? "Voice message" : "Audio message";

            createMessage({
              memberId: member.id,
              direction: "incoming",
              messageType: incoming.type,
              body: incoming.type === "audio" ? audioLabel : media.caption || filename,
              whatsappMessageId: incoming.id ?? null,
              status: "received",
              mediaUrl,
              mediaMimeType: media.mime_type || mediaInfo.mime_type,
              mediaFilename: filename
            });
            notifyDevices(member.name, incoming.type, media.caption ?? "", member.id);
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
}

function wrap(value: Record<string, unknown>) {
  return { entry: [{ changes: [{ value }] }] } as WhatsAppWebhookPayload;
}

export function buildIncomingPayload(input: {
  phone: string;
  text: string;
  messageId?: string;
  profileName?: string;
}) {
  const from = input.phone.replace(/[^\d]/g, "");
  return wrap({
    contacts: input.profileName ? [{ wa_id: from, profile: { name: input.profileName } }] : [],
    messages: [
      {
        from,
        id: input.messageId ?? `sim.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
        type: "text",
        text: { body: input.text }
      }
    ]
  });
}

export function buildStatusPayload(input: {
  whatsappMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  error?: string;
}) {
  return wrap({
    statuses: [
      {
        id: input.whatsappMessageId,
        status: input.status,
        errors: input.error ? [{ title: input.error, message: input.error }] : undefined
      }
    ]
  });
}
