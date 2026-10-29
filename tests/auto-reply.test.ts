import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

// بلاهن `sendWhatsAppText` بترمي قبل ما توصل للإرسال، والردّ التلقائي
// بيبلع الرمية بصمت — فالاختبار بيشوف صفر ردود ويظن إنّ الربط مكسور.
process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "test-phone-id";

const NIGHT = new Date("2026-11-03T22:00:00+02:00"); // ثلاثاء، بعد 19:00
const DAY = new Date("2026-11-03T11:00:00+02:00"); // ثلاثاء، بالدوام

let seq = 0;
async function writer() {
  const { createMember, createMessage } = await import("@/app/lib/db");
  seq += 1;
  const person = createMember({ name: `كاتبة ${seq}`, phone: `+97255000${String(seq).padStart(4, "0")}`, notes: "" })!;
  createMessage({ memberId: person.id, direction: "incoming", body: "مرحبا", status: "received" });
  return person;
}

async function record(memberId: number, key: string, when?: string) {
  const { createMessage, getDb } = await import("@/app/lib/db");
  createMessage({ memberId, direction: "outgoing", body: "رد", status: "sent", sendKey: key });
  if (when) {
    getDb().prepare("UPDATE messages SET created_at = ? WHERE member_id = ? AND send_key = ?").run(when, memberId, key);
  }
}

test("برّا الدوام بيوصلها «خارج نطاق ساعات العمل»", async () => {
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  assert.equal(decideAutoReply(person.id, NIGHT)?.kind, "after-hours");
});

test("أول رسالة بالدوام بيوصلها ترحيب", async () => {
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  assert.equal(decideAutoReply(person.id, DAY)?.kind, "welcome");
});

/** خمس رسائل الساعة 2 بالليل ما بتستاهل خمس ردود. */
test("ردّ واحد بكل فترة إغلاق، مهما بعتت", async () => {
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  await record(person.id, "auto:after-hours", "2026-11-03 20:05:00");

  assert.equal(decideAutoReply(person.id, NIGHT), null, "نفس الليلة: ما بينعاد");
});

test("بس بتشتغل من جديد بفترة الإغلاق الجاية", async () => {
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  // ردّ ليلة الاثنين، والسؤال عن ليلة الثلاثاء — بينهن يوم شغل كامل.
  await record(person.id, "auto:after-hours", "2026-11-02 20:05:00");

  assert.equal(decideAutoReply(person.id, NIGHT)?.kind, "after-hours");
});

/**
 * هاي هي اللي بتنكسر بسهولة: لو ردّنا التلقائي انحسب محادثة، الواحدة اللي
 * كتبت الساعة 2 بالليل بتصير «مش جديدة» وما بيوصلها ترحيب ولا مرة — وهي
 * بعدها ما حكت مع إنسان.
 */
test("ردّ «خارج الدوام» ما بيلغي ترحيبها بكرا", async () => {
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  await record(person.id, "auto:after-hours", "2026-11-02 22:00:00");

  assert.equal(decideAutoReply(person.id, DAY)?.kind, "welcome", "لسّه ما حكت مع حدا");
});

test("الترحيب مرة وحدة بالعمر", async () => {
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  await record(person.id, "auto:welcome");

  assert.equal(decideAutoReply(person.id, DAY), null);
});

test("اللي حكينا معها من قبل ما بيوصلها ترحيب لما ترد", async () => {
  const { createMessage } = await import("@/app/lib/db");
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  // رسالة مسار راحتلها قبل، وبعدين ردّت.
  createMessage({ memberId: person.id, direction: "outgoing", body: "صباح الخير", status: "sent" });
  createMessage({ memberId: person.id, direction: "incoming", body: "تمام", status: "received" });

  assert.equal(decideAutoReply(person.id, DAY), null, "مش جديدة");
});

test("وبرّا الدوام بتظل تاخد «خارج الدوام» حتى لو قديمة", async () => {
  const { createMessage } = await import("@/app/lib/db");
  const { decideAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  const person = await writer();
  createMessage({ memberId: person.id, direction: "outgoing", body: "صباح الخير", status: "sent" });

  assert.equal(decideAutoReply(person.id, NIGHT)?.kind, "after-hours");
});

/**
 * القرار صح ما بيفيد إذا الويبهوك ما بيناديه. هاد الاختبار بيمشي المسار
 * الحقيقي: حمولة واصلة من ميتا ← رسالة متخزّنة ← ردّ تلقائي متخزّن.
 */
test("الويبهوك فعلاً بيبعت الردّ لما توصل رسالة", async () => {
  const { buildIncomingPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");
  const { createMember, getDb } = await import("@/app/lib/db");
  seq += 1;
  const phone = `+97255100${String(seq).padStart(4, "0")}`;
  const person = createMember({ name: `ويبهوك ${seq}`, phone, notes: "" })!;

  await handleWebhookPayload(buildIncomingPayload({ phone, text: "مرحبا، بدي أعرف عن كلين" }));

  const auto = getDb()
    .prepare("SELECT send_key, body FROM messages WHERE member_id = ? AND send_key LIKE 'auto:%'")
    .all(person.id) as Array<{ send_key: string; body: string }>;

  assert.equal(auto.length, 1, "رسالة واصلة لازم تجرّ ردّاً واحداً");
  assert.ok(auto[0].body.includes("Afkar-Eat.Love.Fit"), "النص هو اللي بعته وسام");
});

test("رسالتين بنفس الحمولة = ردّ واحد مش ردّين", async () => {
  const { buildIncomingPayload, handleWebhookPayload } = await import("@/app/lib/whatsapp-webhook");
  const { createMember, getDb } = await import("@/app/lib/db");
  seq += 1;
  const phone = `+97255200${String(seq).padStart(4, "0")}`;
  const person = createMember({ name: `دفعة ${seq}`, phone, notes: "" })!;

  await handleWebhookPayload(buildIncomingPayload({ phone, text: "مرحبا" }));
  await handleWebhookPayload(buildIncomingPayload({ phone, text: "في حدا؟" }));

  const n = (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE member_id = ? AND send_key LIKE 'auto:%'")
      .get(person.id) as { n: number }
  ).n;
  assert.equal(n, 1, "الثانية ما بتجرّ ردّ تاني");
});

test("فشل الإرسال بيبيّن بالمحادثة، ما بيضيع بصمت", async () => {
  const { createMember, getDb } = await import("@/app/lib/db");
  const { sendAutoReply } = await import("@/app/lib/whatsapp/auto-reply");
  seq += 1;
  const phone = `+97255300${String(seq).padStart(4, "0")}`;
  const person = createMember({ name: `فشل ${seq}`, phone, notes: "" })!;
  const { createMessage } = await import("@/app/lib/db");
  createMessage({ memberId: person.id, direction: "incoming", body: "مرحبا", status: "received" });

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  await sendAutoReply(person, DAY);
  process.env.WHATSAPP_ACCESS_TOKEN = token;

  const row = getDb()
    .prepare("SELECT status, error FROM messages WHERE member_id = ? AND send_key LIKE 'auto:%'")
    .get(person.id) as { status: string; error: string | null } | undefined;

  assert.ok(row, "لازم ينتسجّل حتى لو فشل");
  assert.equal(row!.status, "failed");
  assert.ok(row!.error, "والسبب مكتوب");
});
