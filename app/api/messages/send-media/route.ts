import { NextResponse } from "next/server";
import { createStoredMediaFilename, formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_LABEL, writeMediaFile } from "@/app/lib/media-store";
import { createMessage, getMember, updateMessageStatus } from "@/app/lib/db";
import { mediaKindFromMime, sendWhatsAppMedia, uploadWhatsAppMedia } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const memberId = Number(formData.get("memberId"));
    const caption = String(formData.get("caption") ?? "").trim();
    const file = formData.get("file");

    if (!Number.isInteger(memberId)) {
      return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A media file is required." }, { status: 400 });
    }

    if (file.size > MAX_MEDIA_BYTES) {
      return NextResponse.json(
        {
          error: `This file is ${formatBytes(file.size)}. The maximum supported size is ${MAX_MEDIA_LABEL}.`
        },
        { status: 400 }
      );
    }

    const member = getMember(memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const mimeType = file.type || "application/octet-stream";
    const mediaKind = mediaKindFromMime(mimeType);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storedFilename = createStoredMediaFilename({
      mimeType,
      originalName: file.name
    });
    const mediaUrl = writeMediaFile(storedFilename, bytes);

    const pending = createMessage({
      memberId,
      direction: "outgoing",
      messageType: mediaKind,
      body: caption || file.name || mediaKind,
      status: "pending",
      mediaUrl,
      mediaMimeType: mimeType,
      mediaFilename: file.name || storedFilename
    });

    try {
      const mediaId = await uploadWhatsAppMedia({
        bytes,
        mimeType,
        filename: file.name || storedFilename
      });
      const whatsappMessageId = await sendWhatsAppMedia({
        member,
        mediaId,
        kind: mediaKind,
        caption,
        filename: file.name || storedFilename
      });
      const message = updateMessageStatus(pending.id, {
        status: "accepted",
        whatsappMessageId
      });
      return NextResponse.json({ message });
    } catch (error) {
      const message = updateMessageStatus(pending.id, {
        status: "failed",
        error: error instanceof Error ? error.message : "WhatsApp media send failed."
      });
      return NextResponse.json({ message, error: message.error }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid media request." },
      { status: 400 }
    );
  }
}
