import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("a simulated reply lands as an incoming message", async () => {
  const { createMember, listMessages } = await import("@/app/lib/db");
  const { buildIncomingPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");

  const member = createMember({ name: "فحص", phone: "+972500000002", notes: "" });
  await handleWebhookPayload(buildIncomingPayload({ phone: member.phone, text: "أهلين" }));

  // الواصلة نفسها هي موضوع الاختبار. من لما صار الرد التلقائي يشتغل، أي
  // رسالة واصلة بتجرّ وراها ردّاً كمان — فعدّ الكل ما عاد يقيس اللي بدنا إياه.
  const incoming = listMessages(member.id).filter((message) => message.direction === "incoming");
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].body, "أهلين");
});

test("a simulated status updates the message", async () => {
  const { createMember, createMessage, listMessages } = await import("@/app/lib/db");
  const { buildStatusPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");

  const member = createMember({ name: "فحص", phone: "+972500000003", notes: "" });
  createMessage({
    memberId: member.id,
    direction: "outgoing",
    body: "رسالة",
    status: "accepted",
    whatsappMessageId: "dryrun.abc"
  });

  await handleWebhookPayload(buildStatusPayload({ whatsappMessageId: "dryrun.abc", status: "read" }));
  assert.equal(listMessages(member.id)[0].status, "read");
});
