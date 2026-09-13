import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// Dry by default: RAILWAY_PROJECT_NAME is unset outside Railway.
process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";
process.env.WHATSAPP_TEMPLATE_NAME = "hello_world";
process.env.WHATSAPP_TEMPLATE_LANGUAGE = "en_US";
process.env.FIREBASE_PROJECT_ID = "test-project";
// A throwaway key, so push actually gets as far as asking Google for a token.
// Without it the push test would pass merely because no credentials exist.
process.env.FIREBASE_CLIENT_EMAIL = "test@example.invalid";
process.env.FIREBASE_PRIVATE_KEY = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
}).privateKey;
process.env.TELEGRAM_BOT_TOKEN = "test-bot";
process.env.TELEGRAM_CHAT_ID = "1";

const member = {
  id: 1,
  name: "فحص",
  phone: "+972500000001",
  notes: "",
  city: "",
  joined: "",
  service: "",
  lastReadMessageId: null,
  unreadCount: 0,
  groupIds: [],
  createdAt: new Date().toISOString()
};

function failingFetch() {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error(`network call escaped the guard: ${String(input)}`);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("no WhatsApp send reaches the network when not live", async () => {
  const { sendWhatsAppText, sendWhatsAppTemplate, sendWhatsAppMedia, uploadWhatsAppMedia } = await import(
    "@/app/lib/whatsapp"
  );
  const net = failingFetch();

  try {
    const textId = await sendWhatsAppText(member, "مرحبا");
    // No `name` is passed, so the template's parameter check - a live GET - is
    // skipped and only the send path is under test here.
    const template = await sendWhatsAppTemplate(member, {});
    const mediaId = await uploadWhatsAppMedia({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      filename: "a.png"
    });
    const mediaMessageId = await sendWhatsAppMedia({ member, mediaId, kind: "image" });

    assert.match(textId, /^dryrun\./);
    assert.match(template.messageId, /^dryrun\./);
    assert.match(mediaId, /^dryrun\./);
    assert.match(mediaMessageId, /^dryrun\./);
    assert.deepEqual(net.calls, []);
  } finally {
    net.restore();
  }
});

test("push is skipped when not live", async () => {
  const { sendPushToDevices } = await import("@/app/lib/push");
  const net = failingFetch();

  try {
    const result = await sendPushToDevices({ title: "فحص", body: "فحص" });
    assert.deepEqual(result, { sent: 0, skipped: true });
    assert.deepEqual(net.calls, []);
  } finally {
    net.restore();
  }
});

test("telegram still sends, marked as a simulation", async () => {
  const { sendTelegramMessage } = await import("@/app/lib/telegram");
  const bodies: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  try {
    await sendTelegramMessage("تقرير");
    assert.equal(bodies.length, 1);
    assert.ok(bodies[0].includes("محاكاة"));
  } finally {
    globalThis.fetch = original;
  }
});
