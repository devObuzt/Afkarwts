import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();
process.env.PUBLIC_BASE_URL = "https://www.afkarheartbeat.com";

const BASE = {
  name: "t",
  language: "ar",
  bodyText: "نص",
  category: "MARKETING" as const
};

test("القالب التسويقي بياخد الزر والفوتر لحاله", async () => {
  const { applyOptOutRule, OPT_OUT_FOOTER, OPT_OUT_BUTTON_TEXT } = await import(
    "@/app/lib/templates/opt-out-rule"
  );

  const { template, applied } = applyOptOutRule({ ...BASE });
  assert.equal(applied, true);
  assert.equal(template.footerText, OPT_OUT_FOOTER);
  assert.equal(template.buttons?.length, 1);
  assert.equal(template.buttons?.[0].text, OPT_OUT_BUTTON_TEXT);
  assert.match(String((template.buttons?.[0] as { url: string }).url), /\/stop\/\{\{1\}\}$/);
});

test("الزر بينحط آخر واحد — ميتا بترفض «رد، رابط، رد»", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");

  const { template } = applyOptOutRule({
    ...BASE,
    buttons: [
      { type: "QUICK_REPLY", text: "معنية" },
      { type: "URL", text: "احجزي", url: "https://lp.connec.co.il/afkar_bf/" }
    ]
  });
  assert.deepEqual(
    template.buttons?.map((button) => button.type),
    ["QUICK_REPLY", "URL", "URL"],
    "الردود السريعة مجمّعة قبل الروابط"
  );
});

test("فوتر البراند ما بينمحى", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");
  const { template, notes } = applyOptOutRule({ ...BASE, footerText: "Afkar – Eat.Love.Fit" });
  assert.equal(template.footerText, "Afkar – Eat.Love.Fit");
  assert.ok(notes.some((note) => note.includes("ضلّ زي ما هو")));
});

test("UTILITY ما بتنطبق عليه القاعدة", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");
  const { template, applied } = applyOptOutRule({ ...BASE, category: "UTILITY" });
  assert.equal(applied, false);
  assert.equal(template.footerText, undefined);
  assert.equal(template.buttons, undefined);
});

test("الإلغاء الصريح بيمرق، والسكوت لأ", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");

  // 🔑 `undefined` = ما حدا قرّر = القاعدة بتنطبق. الإلغاء لازم يكون صريح.
  assert.equal(applyOptOutRule({ ...BASE, optOutLine: undefined }).applied, true);
  assert.equal(applyOptOutRule({ ...BASE, optOutLine: false }).applied, false);
});

test("تلاتة أزرار أصلاً = القاعدة بتوقف وبتقول ليش", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");
  const { applied, notes, template } = applyOptOutRule({
    ...BASE,
    buttons: [
      { type: "QUICK_REPLY", text: "أ" },
      { type: "QUICK_REPLY", text: "ب" },
      { type: "URL", text: "ج", url: "https://x" }
    ]
  });
  // بتوقف بدل ما تضيف رابع — الرابع بيخفّي طريق الخروج ورا «See all options».
  assert.equal(applied, false);
  assert.equal(template.buttons?.length, 3);
  assert.match(notes[0], /See all options/);
});

test("القالب اللي فيه الزر ما بياخده مرتين", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");
  const { template, applied } = applyOptOutRule({
    ...BASE,
    buttons: [{ type: "URL", text: "إيقاف الرسائل", url: "https://www.afkarheartbeat.com/stop/{{1}}" }]
  });
  assert.equal(applied, true);
  assert.equal(template.buttons?.length, 1);
});

test("رابط غريب فيه /stop/ ما بيمرّق كطريق خروج", async () => {
  const { applyOptOutRule, alreadyCarriesOptOut } = await import("@/app/lib/templates/opt-out-rule");

  // 🔴 الثقب اللي انسدّ: `includes("/stop/")` كان بيخلّي أي رابط يمرّق،
  // فالقاعدة بتتخطّى نفسها والسجل بيقول «ملتزم» على قالب ما بيحمل إشي —
  // وحارس الإرسال بيقرا من نفس السجل.
  const foreign = [{ type: "URL" as const, text: "عرض", url: "https://evil.example.com/stop/x" }];
  assert.equal(alreadyCarriesOptOut(foreign), false, "هوست تاني مش زرّنا");

  const { template, applied } = applyOptOutRule({ ...BASE, buttons: [...foreign] });
  assert.equal(applied, true);
  assert.equal(template.buttons?.length, 2, "الزر الحقيقي انضاف فوقه");
  assert.match(String((template.buttons?.[1] as { url: string }).url), /afkarheartbeat\.com\/stop\//);

  // ومسار تاني على نفس الهوست كمان مش طريق خروج.
  assert.equal(
    alreadyCarriesOptOut([{ type: "URL", text: "x", url: "https://www.afkarheartbeat.com/new/stop-ish" }]),
    false
  );
  // ورابط مكسور ما بيرمي.
  assert.equal(alreadyCarriesOptOut([{ type: "URL", text: "x", url: "مش رابط" }]), false);
});

test("تلاتة أزرار بترجّع blocked — مش إنشاء صامت", async () => {
  const { applyOptOutRule } = await import("@/app/lib/templates/opt-out-rule");
  const { blocked, applied } = applyOptOutRule({
    ...BASE,
    buttons: [
      { type: "QUICK_REPLY", text: "أ" },
      { type: "QUICK_REPLY", text: "ب" },
      { type: "URL", text: "ج", url: "https://x.example" }
    ]
  });
  // المسار بيرفض بـ400 على هاي: قالب تسويقي بلا طريق خروج **مسجَّل
  // كملتزم** أسوأ من رفض بوجه صاحبه.
  assert.equal(blocked, true);
  assert.equal(applied, false);
});
