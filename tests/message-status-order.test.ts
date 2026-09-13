import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let phoneCounter = 0;

async function seed(whatsappMessageId: string) {
  const { createMember, createMessage } = await import("@/app/lib/db");
  phoneCounter += 1;
  const member = createMember({ name: "فحص", phone: `+97250000${String(phoneCounter).padStart(4, "0")}`, notes: "" });
  createMessage({
    memberId: member.id,
    direction: "outgoing",
    body: "رسالة",
    status: "accepted",
    whatsappMessageId
  });
  return member;
}

test("a late delivered does not overwrite read", async () => {
  const { updateMessageStatusByWhatsAppId } = await import("@/app/lib/db");
  await seed("wamid.1");

  updateMessageStatusByWhatsAppId("wamid.1", { status: "read" });
  const after = updateMessageStatusByWhatsAppId("wamid.1", { status: "delivered" });

  assert.equal(after?.status, "read");
});

test("statuses still move forward", async () => {
  const { updateMessageStatusByWhatsAppId } = await import("@/app/lib/db");
  await seed("wamid.2");

  assert.equal(updateMessageStatusByWhatsAppId("wamid.2", { status: "sent" })?.status, "sent");
  assert.equal(updateMessageStatusByWhatsAppId("wamid.2", { status: "delivered" })?.status, "delivered");
  assert.equal(updateMessageStatusByWhatsAppId("wamid.2", { status: "read" })?.status, "read");
});

test("failed replaces an early status but not a delivered one", async () => {
  const { updateMessageStatusByWhatsAppId } = await import("@/app/lib/db");
  await seed("wamid.3");
  await seed("wamid.4");

  const early = updateMessageStatusByWhatsAppId("wamid.3", { status: "failed", error: "undeliverable" });
  assert.equal(early?.status, "failed");
  assert.equal(early?.error, "undeliverable");

  updateMessageStatusByWhatsAppId("wamid.4", { status: "delivered" });
  const late = updateMessageStatusByWhatsAppId("wamid.4", { status: "failed", error: "undeliverable" });
  assert.equal(late?.status, "delivered");
});
