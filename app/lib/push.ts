import crypto from "node:crypto";
import { listActiveDeviceTokens, removeDevice, totalUnreadCount } from "./db";

type ServiceAccountToken = { value: string; expiresAt: number };

const globalForPush = globalThis as typeof globalThis & {
  __afkarPushToken?: ServiceAccountToken;
};

function base64url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

// Firebase Cloud Messaging (HTTP v1) delivers to both Android and iOS.
async function getAccessToken() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail || !privateKey) {
    return null;
  }

  const cached = globalForPush.__afkarPushToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.value;
  }

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  )}`;

  try {
    const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey).toString("base64url");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${unsigned}.${signature}`
      })
    });

    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!response.ok || !payload.access_token) {
      return null;
    }

    globalForPush.__afkarPushToken = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000
    };
    return payload.access_token;
  } catch {
    return null;
  }
}

export async function sendPushToDevices(input: {
  title: string;
  body: string;
  memberId?: number;
}) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const accessToken = await getAccessToken();

  if (!projectId || !accessToken) {
    return { sent: 0, skipped: true };
  }

  const tokens = listActiveDeviceTokens();
  if (!tokens.length) {
    return { sent: 0, skipped: false };
  }

  const badge = totalUnreadCount();
  let sent = 0;

  for (const token of tokens) {
    try {
      const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: input.title, body: input.body },
            data: input.memberId ? { memberId: String(input.memberId) } : {},
            android: {
              priority: "HIGH",
              notification: { sound: "default", channel_id: "messages" }
            },
            apns: {
              headers: { "apns-priority": "10" },
              payload: { aps: { sound: "default", badge } }
            }
          }
        })
      });

      if (response.ok) {
        sent += 1;
        continue;
      }

      // Drop tokens the device no longer owns so the list stays clean.
      if (response.status === 404 || response.status === 400) {
        const detail = (await response.json().catch(() => null)) as
          | { error?: { status?: string } }
          | null;
        if (detail?.error?.status === "NOT_FOUND" || detail?.error?.status === "UNREGISTERED") {
          removeDevice(token);
        }
      }
    } catch {
      // Ignore per-device failures; the rest still get notified.
    }
  }

  return { sent, skipped: false };
}

export function messagePreview(input: { type: string; body: string }) {
  if (input.type === "audio") return "🎙️ رسالة صوتية";
  if (input.type === "image") return "📷 صورة";
  if (input.type === "video") return "🎬 فيديو";
  if (input.type === "document") return "📎 ملف";
  const text = input.body.trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text || "رسالة جديدة";
}
