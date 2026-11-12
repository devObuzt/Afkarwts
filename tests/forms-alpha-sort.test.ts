import test from "node:test";
import assert from "node:assert/strict";

/**
 * نفس قاعدة الترتيب اللي بالمسار: مقارنة بلغة العمود، والفاضي بالآخر
 * بالاتجاهين. مكتوبة هون كـوحدة عشان تنفحص بلا ما نقوم سيرفر.
 */
function sorted(keys: string[], lang: "ar" | "he", down = false) {
  const collator = new Intl.Collator(lang, { numeric: true, sensitivity: "base" });
  return keys
    .map((key, at) => ({ key: key.trim(), at }))
    .sort((a, b) => {
      if (!a.key !== !b.key) {
        return a.key ? -1 : 1;
      }
      const cmp = collator.compare(a.key, b.key);
      return (down ? -cmp : cmp) || a.at - b.at;
    })
    .map((item) => item.key);
}

test("الأسماء العربية بتترتّب أبجدياً", async () => {
  assert.deepEqual(sorted(["ياسمين", "أحلام", "سناء", "بشرى"], "ar"), ["أحلام", "بشرى", "سناء", "ياسمين"]);
});

test("الفاضي بالآخر — بالطالع وبالنازل", async () => {
  assert.deepEqual(sorted(["ندى", "", "أمل"], "ar"), ["أمل", "ندى", ""]);
  assert.deepEqual(sorted(["ندى", "", "أمل"], "ar", true), ["ندى", "أمل", ""]);
});

test("الهمزة والألف بيقعدوا جنب بعض مش بطرفَي الجدول", async () => {
  // بلا `sensitivity: base`، «أمل» و«امل» بينفصلوا — والاتنين نفس الاسم
  // مكتوب بصيغتين، وهاد بيصير كل يوم بأسماء الاستمارة.
  const out = sorted(["امل", "بشرى", "أمل"], "ar");
  assert.deepEqual(out.slice(0, 2).sort(), ["أمل", "امل"]);
  assert.equal(out[2], "بشرى");
});

test("العبري بترتيبه هو", async () => {
  assert.deepEqual(sorted(["שרה", "אביב", "מרים"], "he"), ["אביב", "מרים", "שרה"]);
});
