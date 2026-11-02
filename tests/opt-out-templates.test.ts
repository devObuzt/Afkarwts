import assert from "node:assert/strict";
import test from "node:test";

test("التعديل بينسخ كل المكوّنات، وما بيمحي مثال الجسم", async () => {
  const { planComponents, FOOTER_TEXT, BUTTON_TEXT } = await import("../tools/add-opt-out.ts");

  // 🔑 القالب الحقيقي فيه `example` تبع الجسم. التعديل عند ميتا بيستبدل
  // كل المكوّنات، فلو ضاع المثال بينرفض التعديل — والقالب المرفوض بيوقف
  // يشتغل. هاد الاختبار هو الحارس على هاي النقطة.
  const before = [
    { type: "HEADER", format: "IMAGE", example: { header_handle: ["4::aGFuZGxl"] } },
    { type: "BODY", text: "مرحبا {{1}}، عرض الكلين بلّش", example: { body_text: [["ليلى"]] } }
  ];

  const plan = planComponents(structuredClone(before) as never);
  assert.ok(!("skip" in plan));
  const next = (plan as { next: Array<Record<string, unknown>> }).next;

  assert.deepEqual(next[0], before[0], "الهيدر انتسخ حرفياً");
  assert.deepEqual(next[1], before[1], "الجسم ومثاله انتسخوا حرفياً");
  assert.deepEqual(next[2], { type: "FOOTER", text: FOOTER_TEXT });

  const buttons = next[3] as { type: string; buttons: Array<Record<string, unknown>> };
  assert.equal(buttons.type, "BUTTONS");
  assert.equal(buttons.buttons.length, 1);
  assert.equal(buttons.buttons[0].text, BUTTON_TEXT);
  assert.match(String(buttons.buttons[0].url), /\/stop\/\{\{1\}\}$/);
  assert.ok(Array.isArray(buttons.buttons[0].example), "الزر المتغيّر بدّه مثال");
});

test("فوتر البراند بيضل، والزر بينضاف بعد الأزرار الموجودة", async () => {
  const { planComponents, BUTTON_TEXT } = await import("../tools/add-opt-out.ts");

  const plan = planComponents([
    { type: "BODY", text: "بدك العرض؟" },
    { type: "FOOTER", text: "Afkar – Eat.Love.Fit" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "بدي العرض" }] }
  ] as never);

  assert.ok(!("skip" in plan), "ما بينتخطّى — هاد أكثر قالب بحاجة لطريق خروج");
  const { next, keptFooter } = plan as { next: Array<Record<string, unknown>>; keptFooter: boolean };
  assert.equal(keptFooter, true);
  assert.deepEqual(next[1], { type: "FOOTER", text: "Afkar – Eat.Love.Fit" }, "كلام البراند ما انمحى");

  const buttons = (next[2] as { buttons: Array<Record<string, unknown>> }).buttons;
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].text, "بدي العرض", "الكبسة الموجودة أولاً — ميتا بتطلب تجميع الردود السريعة");
  assert.equal(buttons[1].text, BUTTON_TEXT);
});

test("القالب اللي فيه الزر ما بينعدّل مرتين", async () => {
  const { planComponents, hasOptOut } = await import("../tools/add-opt-out.ts");

  const withButton = [
    { type: "BODY", text: "عرض" },
    { type: "BUTTONS", buttons: [{ type: "URL", text: "إيقاف", url: "https://x/stop/{{1}}" }] }
  ];
  assert.equal(hasOptOut(withButton as never), true);
  assert.ok("skip" in planComponents(withButton as never));
});

test("الفوتر والزر جوّا حدود ميتا", async () => {
  const { FOOTER_TEXT, BUTTON_TEXT } = await import("../tools/add-opt-out.ts");
  assert.ok([...FOOTER_TEXT].length <= 60, "الفوتر 60 حرف بالأكثر");
  assert.ok([...BUTTON_TEXT].length <= 25, "نص الزر 25 حرف بالأكثر");
});
