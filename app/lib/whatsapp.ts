import { phoneForWhatsApp, type Member } from "./db";

type WhatsAppSendResponse = {
  messages?: Array<{ id: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
};

type WhatsAppMediaInfo = {
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
  id: string;
};

export type OutboundMediaKind = "image" | "video" | "document";

export async function sendWhatsAppText(member: Member, body: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForWhatsApp(member.phone),
      type: "text",
      text: {
        preview_url: false,
        body
      }
    })
  });

  const payload = (await response.json()) as WhatsAppSendResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `WhatsApp API failed with ${response.status}`);
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response did not include a message id.");
  }

  return messageId;
}

export async function sendWhatsAppTemplate(member: Member) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  if (!templateName) {
    throw new Error("WHATSAPP_TEMPLATE_NAME is missing.");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForWhatsApp(member.phone),
      type: "template",
      template: {
        name: templateName,
        language: {
          code: templateLanguage
        }
      }
    })
  });

  const payload = (await response.json()) as WhatsAppSendResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `WhatsApp API failed with ${response.status}`);
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response did not include a message id.");
  }

  return {
    messageId,
    templateName,
    templateLanguage
  };
}

export function mediaKindFromMime(mimeType: string): OutboundMediaKind {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  return "document";
}

export async function uploadWhatsAppMedia(input: { bytes: Uint8Array; mimeType: string; filename: string }) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  const formData = new FormData();
  formData.set("messaging_product", "whatsapp");
  const mediaBuffer = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength
  ) as ArrayBuffer;
  formData.set("file", new File([mediaBuffer], input.filename, { type: input.mimeType }));

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  const payload = (await response.json()) as { id?: string; error?: { message?: string } };

  if (!response.ok || !payload.id) {
    throw new Error(payload.error?.message || `WhatsApp media upload failed with ${response.status}`);
  }

  return payload.id;
}

export async function sendWhatsAppMedia(input: {
  member: Member;
  mediaId: string;
  kind: OutboundMediaKind;
  caption?: string;
  filename?: string;
}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  const mediaPayload: Record<string, string> = { id: input.mediaId };
  if (input.caption && input.kind !== "document") {
    mediaPayload.caption = input.caption;
  }
  if (input.kind === "document") {
    mediaPayload.filename = input.filename || "file";
    if (input.caption) {
      mediaPayload.caption = input.caption;
    }
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phoneForWhatsApp(input.member.phone),
      type: input.kind,
      [input.kind]: mediaPayload
    })
  });

  const payload = (await response.json()) as WhatsAppSendResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `WhatsApp API failed with ${response.status}`);
  }

  const messageId = payload.messages?.[0]?.id;
  if (!messageId) {
    throw new Error("WhatsApp API response did not include a message id.");
  }

  return messageId;
}

export async function getWhatsAppMediaInfo(mediaId: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${mediaId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const payload = (await response.json()) as WhatsAppMediaInfo & { error?: { message?: string } };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error?.message || `WhatsApp media lookup failed with ${response.status}`);
  }

  return payload;
}

export async function downloadWhatsAppMedia(mediaUrl: string) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`WhatsApp media download failed with ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}
