import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 🔴 المقبض ضاع مرة.
 *
 * `RowOrder` بتزرع المقبض بالـDOM من برا شجرة ريأكت. وكل كبسة بالتقرير
 * بتنادي `router.refresh()` — «ترتيب رسمي»، الترتيب الأبجدي، تعبئة
 * الطبي — وريأكت بتعيد رسم الجدول وبتمسح اللي مش منها. أول نسخة زرعت
 * المقابض مرة وحدة عند التركيب، فأول كبسة ترتيب كانت بتطيّرهن.
 *
 * هاد الفحص بيقرا المصدر: الزرع لازم يضل مربوط بمراقب بيعيده.
 */
const SOURCE = readFileSync(
  new URL("../app/new/forms/[id]/report/RowOrder.tsx", import.meta.url),
  "utf8"
);

test("زرع المقبض مربوط بمراقب بيعيده بعد كل إعادة رسم", () => {
  assert.ok(/new MutationObserver/.test(SOURCE), "بلا مراقب، أول كبسة ترتيب بتطيّر المقابض");
  assert.ok(/watch\.observe\(body, \{ childList: true, subtree: true \}\)/.test(SOURCE), "المراقبة على جسم الجدول");
  assert.ok(/function ensureGrips\(\)/.test(SOURCE), "الزرع بدالة تنعاد، مش سطر بينمشي مرة");
  // والدالة بتفحص قبل ما تزرع، وإلا الزرع بيولّد تغيير بيولّد زرع.
  assert.ok(/cell\.querySelector\("\.rowGrip"\)/.test(SOURCE), "بتتخطّى السطر اللي معه مقبض — بلاها بتصير دورة");
});

test("كبسات التقرير اللي بتعيد الرسم موجودة فعلاً", () => {
  // لو انشالت كل الكبسات، المراقب فوق بيصير بلا سبب — وهاد الفحص
  // بيضل يذكّر ليش هو موجود.
  for (const file of ["OfficialOrder", "SortHead", "FillMedical"]) {
    const text = readFileSync(
      new URL(`../app/new/forms/[id]/report/${file}.tsx`, import.meta.url),
      "utf8"
    );
    assert.ok(/router\.refresh\(\)/.test(text), `${file} بتعيد رسم الجدول`);
  }
});
