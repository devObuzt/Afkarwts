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
