import { formatBytes, MAX_MEDIA_BYTES, MAX_MEDIA_LABEL } from "./media-store";
import { phoneForWhatsApp, type Member } from "./db";

type WhatsAppSendResponse = {
  messages?: Array<{ id: string }>;
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: {
      details?: string;
    };
    fbtrace_id?: string;
  };
};

type WhatsAppMediaInfo = {
  url: string;
  mime_type: string;
  sha256?: string;
  file_size?: number;
  id: string;
};

export type OutboundMediaKind = "image" | "video" | "document" | "audio";
export const WHATSAPP_IMAGE_BYTES = 5 * 1024 * 1024;
export const WHATSAPP_VIDEO_BYTES = 16 * 1024 * 1024;
export const WHATSAPP_AUDIO_BYTES = 16 * 1024 * 1024;

const audioMimeTypes = new Set(["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"]);

const documentMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function whatsAppErrorMessage(payload: WhatsAppSendResponse, fallback: string) {
  const message = payload.error?.message;
  const details = payload.error?.error_data?.details;

  if (message && details) {
    return `${message}: ${details}`;
  }

  return message || fallback;
}

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

export type TemplateSendOptions = {
  name?: string;
  language?: string;
  bodyParams?: string[];
};

export async function sendWhatsAppTemplate(member: Member, options: TemplateSendOptions = {}) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const templateName = options.name || process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = options.language || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  const bodyParams = options.bodyParams ?? [];

  if (!accessToken || !phoneNumberId) {
    throw new Error("WhatsApp environment variables are missing.");
  }

  if (!templateName) {
    throw new Error("WHATSAPP_TEMPLATE_NAME is missing.");
  }

  const template: Record<string, unknown> = {
    name: templateName,
    language: {
      code: templateLanguage
    }
  };

  if (bodyParams.length) {
    template.components = [
      {
        type: "body",
        parameters: bodyParams.map((text) => ({ type: "text", text }))
      }
    ];
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
      template
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

const TIER_LIMITS: Record<string, number> = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1000,
  TIER_10K: 10000,
  TIER_100K: 100000,
  TIER_UNLIMITED: 1000000
};

export type MessagingLimit = {
  dailyLimit: number;
  suggested: number;
  tier: string | null;
  quality: string | null;
  source: "meta" | "env";
};

let limitCache: { value: MessagingLimit; at: number } | null = null;

// Business-initiated conversation limit per 24h. Meta only exposes the tier on
// some accounts; when absent we fall back to WHATSAPP_DAILY_LIMIT (default 1000
// — the starting tier for verified businesses). Suggested default is 70%.
export async function getMessagingLimit(): Promise<MessagingLimit> {
  if (limitCache && Date.now() - limitCache.at < 60 * 60 * 1000) {
    return limitCache.value;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const wabaId = process.env.WHATSAPP_WABA_ID;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  let tier: string | null = null;
  let quality: string | null = null;

  if (accessToken && wabaId) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers?fields=id,messaging_limit_tier,quality_rating`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const payload = (await response.json()) as {
        data?: Array<{ id?: string; messaging_limit_tier?: string; quality_rating?: string }>;
      };
      const entry =
        payload.data?.find((item) => item.id === phoneNumberId) ?? payload.data?.[0];
      tier = entry?.messaging_limit_tier ?? null;
      quality = entry?.quality_rating ?? null;
    } catch {
      // keep fallback
    }
  }

  const envLimit = Number(process.env.WHATSAPP_DAILY_LIMIT) || 1000;
  const dailyLimit = tier && TIER_LIMITS[tier] ? TIER_LIMITS[tier] : envLimit;

  const value: MessagingLimit = {
    dailyLimit,
    suggested: Math.max(1, Math.floor(dailyLimit * 0.7)),
    tier,
    quality,
    source: tier && TIER_LIMITS[tier] ? "meta" : "env"
  };

  limitCache = { value, at: Date.now() };
  return value;
}

export type WhatsAppTemplate = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  headerText: string | null;
  paramCount: number;
  hasMediaHeader: boolean;
};

type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
};

type TemplateListResponse = {
  data?: Array<{
    name?: string;
    status?: string;
    language?: string;
    category?: string;
    components?: TemplateComponent[];
  }>;
  paging?: { next?: string };
  error?: { message?: string };
};

function countBodyParams(text: string) {
  let max = 0;
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v23.0";
  const wabaId = process.env.WHATSAPP_WABA_ID;

  if (!accessToken) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is missing.");
  }

  if (!wabaId) {
    throw new Error("WHATSAPP_WABA_ID is missing. Add it to the environment to list templates.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates?fields=name,status,language,category,components&limit=200`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const payload = (await response.json()) as TemplateListResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Template list failed with ${response.status}`);
  }

  const templates: WhatsAppTemplate[] = [];

  for (const item of payload.data ?? []) {
    if (item.status !== "APPROVED" || !item.name || !item.language) {
      continue;
    }

    const body = item.components?.find((component) => component.type === "BODY");
    const header = item.components?.find((component) => component.type === "HEADER");
    const bodyText = body?.text ?? "";

    templates.push({
      name: item.name,
      language: item.language,
      category: item.category ?? "",
      bodyText,
      headerText: header?.format === "TEXT" ? header.text ?? null : null,
      paramCount: countBodyParams(bodyText),
      hasMediaHeader: Boolean(header && header.format && header.format !== "TEXT")
    });
  }

  return templates;
}

export function mediaKindFromMime(mimeType: string, byteLength = 0): OutboundMediaKind {
  if (mimeType.startsWith("image/") && byteLength <= WHATSAPP_IMAGE_BYTES) {
    return "image";
  }

  if ((mimeType === "video/mp4" || mimeType === "video/3gpp") && byteLength <= WHATSAPP_VIDEO_BYTES) {
    return "video";
  }

  if (audioMimeTypes.has(mimeType) && byteLength <= WHATSAPP_AUDIO_BYTES) {
    return "audio";
  }

  return "document";
}

export function validateOutboundMediaForWhatsApp(input: { mimeType: string; byteLength: number }) {
  if (input.mimeType === "video/quicktime") {
    return "MOV is not supported by WhatsApp Cloud API. Convert it to MP4 and keep it under 16 MB.";
  }

  if (input.mimeType === "video/mp4" || input.mimeType === "video/3gpp") {
    if (input.byteLength > WHATSAPP_VIDEO_BYTES) {
      return `This video is ${formatBytes(input.byteLength)}. WhatsApp Cloud API supports videos up to 16 MB.`;
    }

    return null;
  }

  if (input.mimeType === "image/jpeg" || input.mimeType === "image/png" || input.mimeType === "image/webp") {
    if (input.byteLength > WHATSAPP_IMAGE_BYTES) {
      return `This image is ${formatBytes(input.byteLength)}. WhatsApp Cloud API supports images up to 5 MB.`;
    }

    return null;
  }

  if (input.mimeType.startsWith("audio/")) {
    if (!audioMimeTypes.has(input.mimeType)) {
      return "This audio format is not supported by WhatsApp. Use MP3, M4A/AAC, OGG, or AMR.";
    }

    if (input.byteLength > WHATSAPP_AUDIO_BYTES) {
      return `This audio file is ${formatBytes(input.byteLength)}. WhatsApp Cloud API supports audio up to 16 MB.`;
    }

    return null;
  }

  if (documentMimeTypes.has(input.mimeType)) {
    if (input.byteLength > MAX_MEDIA_BYTES) {
      return `This file is ${formatBytes(input.byteLength)}. The maximum supported size is ${MAX_MEDIA_LABEL}.`;
    }

    return null;
  }

  return "This file type is not supported by WhatsApp Cloud API.";
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

  const payload = (await response.json()) as WhatsAppSendResponse & { id?: string };

  if (!response.ok || !payload.id) {
    throw new Error(whatsAppErrorMessage(payload, `WhatsApp media upload failed with ${response.status}`));
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

  // WhatsApp does not support captions on audio messages.
  const mediaPayload: Record<string, string> = { id: input.mediaId };
  if (input.caption && (input.kind === "image" || input.kind === "video")) {
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
    throw new Error(whatsAppErrorMessage(payload, `WhatsApp API failed with ${response.status}`));
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
