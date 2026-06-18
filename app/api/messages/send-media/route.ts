import { NextResponse } from "next/server";
import { createStoredMediaFilename, formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_LABEL, writeMediaFile } from "@/app/lib/media-store";
import { createMessage, getMember, updateMessageStatus } from "@/app/lib/db";
import { mediaKindFromMime, sendWhatsAppMedia, uploadWhatsAppMedia } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    if (contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "This upload format is no longer supported. Refresh the page and try again." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const memberId = Number(url.searchParams.get("memberId"));
    const caption = (url.searchParams.get("caption") ?? "").trim();
    const originalFilename = url.searchParams.get("filename") || "file";
    const mimeType = url.searchParams.get("mimeType") || contentType;
    const contentLength = Number(request.headers.get("content-length") ?? 0);

    if (!Number.isInteger(memberId)) {
      return NextResponse.json({ error: "Invalid member id." }, { status: 400 });
    }

    if (!contentLength) {
      return NextResponse.json({ error: "A media file is required." }, { status: 400 });
    }

    if (contentLength > MAX_MEDIA_BYTES) {
      return NextResponse.json(
        {
          error: `This file is ${formatBytes(contentLength)}. The maximum supported size is ${MAX_MEDIA_LABEL}.`
        },
        { status: 400 }
      );
    }

    const member = getMember(memberId);
    if (!member) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const mediaKind = mediaKindFromMime(mimeType);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const storedFilename = createStoredMediaFilename({
      mimeType,
      originalName: originalFilename
    });
    const mediaUrl = writeMediaFile(storedFilename, bytes);

    const pending = createMessage({
      memberId,
      direction: "outgoing",
      messageType: mediaKind,
      body: caption || originalFilename || mediaKind,
      status: "pending",
      mediaUrl,
      mediaMimeType: mimeType,
      mediaFilename: originalFilename || storedFilename
    });

    try {
      const mediaId = await uploadWhatsAppMedia({
        bytes,
        mimeType,
        filename: originalFilename || storedFilename
      });
      const whatsappMessageId = await sendWhatsAppMedia({
        member,
        mediaId,
        kind: mediaKind,
        caption,
        filename: originalFilename || storedFilename
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
