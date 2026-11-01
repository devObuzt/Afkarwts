import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;
async function clubMember(name: string, phone: string) {
  const { createMember } = await import("@/app/lib/db");
  seq += 1;
  return createMember({ name, phone, notes: "" })!;
}

async function morningPayment(input: { phone?: string; name?: string; amount: number }) {
  const { getDb } = await import("@/app/lib/db");
  seq += 1;
  getDb()
    .prepare(
      `INSERT INTO payments (morning_id, paid_on, amount, client_name, client_phone, methods)
       VALUES (?, '2026-10-20', ?, ?, ?, '[3]')`
    )
    .run(`m-${seq}`, input.amount, input.name ?? "", input.phone ?? "");
  return Number((getDb().prepare("SELECT MAX(id) AS id FROM payments").get() as { id: number }).id);
}

/** كل رقم بيدخل المنظومة هو عضو نادي لحد ما يتحوّل. */
test("الجديد بيبلّش عضو نادي مش منتسب", async () => {
  const person = await clubMember("ريم", "+972521230001");
  assert.equal(person.stage, "club");
  assert.equal(person.becameMemberAt, null);
});

test("التحويل بيغيّر المرحلة وبيعلّق المنتجات كملصقات", async () => {
  const { convertToMember } = await import("@/app/lib/members/convert");
  const { getMember } = await import("@/app/lib/db");
  const { labelsFor } = await import("@/app/lib/labels/store");
  const person = await clubMember("هدى صالح", "+972521230002");

  const result = convertToMember(
    { memberId: person.id, name: "هدى صالح", hebrewName: "", paid: true, method: 3, paymentId: null, products: ["clean", "shaper"] },
    1
  );

  assert.equal(result.ok, true);
  const after = getMember(person.id)!;
  assert.equal(after.stage, "member");
  assert.ok(after.becameMemberAt, "ووقت التحويل بينحفظ");
  assert.deepEqual(
    labelsFor(person.id).map((label) => label.name).sort(),
    ["clean", "shaper"],
    "🔑 المنتَج بينحفظ كملصق — وبينعمل إذا مش موجود"
  );
});

/** الاقتراح الآلي بيتعبّى لما الأدمن ما يكتب إشي. */
test("الاسم العبري بينقترح لما يُترك فاضي، وبيغلبه اللي كتبه الأدمن", async () => {
  const { convertToMember } = await import("@/app/lib/members/convert");
  const { getMember } = await import("@/app/lib/db");

  const auto = await clubMember("سناء", "+972521230003");
  convertToMember({ memberId: auto.id, name: "سناء", hebrewName: "", paid: false, method: null, paymentId: null, products: ["clean"] }, 1);
  assert.ok(getMember(auto.id)!.hebrewName.length > 0, "انقترح لحاله");

  const typed = await clubMember("سناء", "+972521230004");
  convertToMember({ memberId: typed.id, name: "سناء", hebrewName: "סנא", paid: false, method: null, paymentId: null, products: ["clean"] }, 1);
  assert.equal(getMember(typed.id)!.hebrewName, "סנא", "🔑 اللي كتبه البني آدم ما بينداس عليه");
});

test("بلا منتَج ما في تحويل", async () => {
  const { convertToMember } = await import("@/app/lib/members/convert");
  const { getMember } = await import("@/app/lib/db");
  const person = await clubMember("بلا منتَج", "+972521230005");

  const result = convertToMember({ memberId: person.id, name: "بلا منتَج", hebrewName: "", paid: false, method: null, paymentId: null, products: [] }, 1);

  assert.equal(result.ok, false);
  assert.equal(getMember(person.id)!.stage, "club", "وما تغيّرت مرحلته");
});

/** الرقم أولاً — هاي القاعدة اللي بتمنع تكرار كو أكاديمي. */
test("الدفعة بتنلاقى بالرقم حتى لو انكتب بصيغة تانية", async () => {
  const { paymentCandidates } = await import("@/app/lib/members/payment-match");
  const person = await clubMember("منار", "+972521230006");
  await morningPayment({ phone: "0521230006", amount: 390 });

  const found = paymentCandidates(person);
  assert.equal(found.length, 1);
  assert.equal(found[0].matchedBy, "phone", "المطابقة بالرقم مش بالاسم");
  assert.equal(found[0].amount, 390);
});

test("والاسم مرشّح ثاني — معلّم إنه بالاسم", async () => {
  const { paymentCandidates } = await import("@/app/lib/members/payment-match");
  const person = await clubMember("ليلى حجازي", "+972521230007");
  await morningPayment({ name: "ليلى حجازي", amount: 250 });

  const found = paymentCandidates(person);
  assert.equal(found.length, 1);
  assert.equal(found[0].matchedBy, "name");
});

/**
 * السبب اللي خلّى وسام يقول «الأدمن بيشوف الاحتمالات مش احتمال واحد»:
 * الاسم بيكرّر، والمنظومة ما بتعرف أيّهن.
 */
test("اسم متكرّر بيرجّع كل الاحتمالات — ولا وحدة بتنختار لحالها", async () => {
  const { paymentCandidates } = await import("@/app/lib/members/payment-match");
  const person = await clubMember("ريم عبد", "+972521230008");
  await morningPayment({ name: "ريم عبد", amount: 100 });
  await morningPayment({ name: "ريم عبد", amount: 450 });

  const found = paymentCandidates(person);
  assert.equal(found.length, 2, "الاتنين بينعرضوا والأدمن بيوثّق");
});

test("الدفعة المربوطة بحدا تاني بتبيّن معلّمة مش مخفية", async () => {
  const { paymentCandidates, linkPayment } = await import("@/app/lib/members/payment-match");
  const other = await clubMember("صاحبة الدفعة", "+972521230009");
  const person = await clubMember("صاحبة الدفعة", "+972521230010");
  const payment = await morningPayment({ name: "صاحبة الدفعة", amount: 300 });
  linkPayment(payment, other.id);

  const found = paymentCandidates(person);
  assert.equal(found.length, 1);
  assert.ok(found[0].takenBy, "معلّمة إنها مربوطة — عشان ما تنسرق بالغلط");
  assert.equal(found[0].takenBy!.id, other.id);
});
