import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

/**
 * 🔴 الترتيب لازم يمشي على **اللي الجدول بيعرضه**.
 *
 * عمودَي العبري بالتقرير بينرسموا من المخزّن، وإذا كان فاضي بتنرسم
 * **نقحرة** من العربي. وأول نسخة من الترتيب قرأت العمود الخام ورجعت
 * للاسم العربي — فثلاث أسماء منقحَرة انرتّبت بنصّها العربي، والعربي
 * بترتيب العبري بيجي بعد كل الحروف العبرية، فانرمت بآخر القائمة:
 * «היא חסין» (ה) طلعت بعد «נור» (נ). وسام شافها بعينه.
 */
test("الاسم المنقحَر بياخد محله العبري مش محل نصّه العربي", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");
  assert.equal(hebrewNameFor("هيا حسين"), "היא חסין");

  const collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });
  // هاي هي الحقيقة اللي كسرت الترتيب: العربي بعد العبري.
  assert.ok(collator.compare("هيا حسين", "נור עלי") > 0);

  const rows = [
    { name: "نور علي", hebrewName: "נור עלי" },
    { name: "هيا حسين", hebrewName: "" },
    { name: "احلام اسدي", hebrewName: "אחלאם אסדי" }
  ];
  const key = (row: (typeof rows)[number]) => row.hebrewName || hebrewNameFor(row.name);
  assert.deepEqual(
    rows.map(key).sort(collator.compare),
    ["אחלאם אסדי", "היא חסין", "נור עלי"]
  );
});

test("البلدة كمان بتنرتّب بالعبري المعروض", async () => {
  const { hebrewTownFor } = await import("@/app/lib/forms/hebrew-town");
  const collator = new Intl.Collator("he", { numeric: true, sensitivity: "base" });
  const rows = [
    { city: "سخنين", hebrewCity: "" },
    { city: "عكا", hebrewCity: "עכו" }
  ];
  const key = (row: (typeof rows)[number]) => row.hebrewCity || hebrewTownFor(row.city);
  const out = rows.map(key);
  assert.ok(out.every((value) => value && !/[؀-ۿ]/.test(value)), `بقي عربي بالمفاتيح: ${out}`);
  assert.deepEqual([...out].sort(collator.compare), out.slice().sort(collator.compare));
});
