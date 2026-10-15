import test from "node:test";
import assert from "node:assert/strict";

test("an Arabic name comes across in Hebrew letters", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");

  assert.equal(hebrewNameFor("سناء حاج"), "סנאא חאג'");
  // ض is ד in Israeli practice: رمضان is רמדאן, not רמצאן.
  assert.equal(hebrewNameFor("ليلى عوض"), "לילא עוד");
  assert.equal(hebrewNameFor("رمضان"), "רמדאן");
  assert.equal(hebrewNameFor("هدى"), "הדא");
  assert.equal(hebrewNameFor("نور الدين"), "נור אלדין");
});

test("letters that change shape at the end of a word do", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");

  // כ מ נ פ צ become ך ם ן ף ץ, or the name is misspelt in Hebrew.
  assert.ok(hebrewNameFor("كريم").endsWith("ם"), hebrewNameFor("كريم"));
  assert.ok(hebrewNameFor("حسن").endsWith("ן"), hebrewNameFor("حسن"));
  assert.ok(hebrewNameFor("يوسف").endsWith("ף"), hebrewNameFor("يوسف"));

  // And a geresh keeps hold of its letter: the final form is the letter's.
  assert.equal(hebrewNameFor("فرج"), "פרג'");
});

test("a name already in Hebrew is left exactly as somebody typed it", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");

  assert.equal(hebrewNameFor("מנאר בוירת"), "מנאר בוירת");
  assert.equal(hebrewNameFor("רנדה קיס"), "רנדה קיס");
  assert.equal(hebrewNameFor("סברא עביר"), "סברא עביר");
});

test("a Latin name is not guessed at", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");

  // «maria hsarme» could be מריה or מאריה, and a wrong name on a delivery
  // list is worse than an empty cell somebody fills in.
  assert.equal(hebrewNameFor("maria hsarme"), "");
  assert.equal(hebrewNameFor(""), "");
  assert.equal(hebrewNameFor("   "), "");
});

test("vowel marks and the tatweel are not letters", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");

  assert.equal(hebrewNameFor("سُهى"), hebrewNameFor("سهى"));
  assert.equal(hebrewNameFor("مُحَمَّد"), hebrewNameFor("محمد"));
  assert.equal(hebrewNameFor("ســناء"), hebrewNameFor("سناء"));
});

test("a town is looked up, not guessed", async () => {
  const { hebrewTownFor } = await import("@/app/lib/forms/hebrew-town");

  // The register carries both names, so these are the towns' own names.
  assert.equal(hebrewTownFor("عرابة"), "עראבה");
  assert.equal(hebrewTownFor("سخنين"), "סח'נין");
  assert.equal(hebrewTownFor("أم الفحم"), "אום אל-פחם");
  // Fixed in the register on 2026-10-15; before that it had no Arabic name.
  assert.equal(hebrewTownFor("دير الأسد"), "דייר אל-אסד");
  assert.equal(hebrewTownFor("عيلبون"), "עיילבון");
});

test("a town written loosely still finds itself", async () => {
  const { hebrewTownFor } = await import("@/app/lib/forms/hebrew-town");

  // «عرابه» with a ha, «الرامة» with the article, a plain alif — the ways
  // people actually type a town into a form.
  assert.equal(hebrewTownFor("عرابه"), "עראבה");
  assert.equal(hebrewTownFor(" عرابة "), "עראבה");
  assert.equal(hebrewTownFor("ام الفحم"), "אום אל-פחם");
});

test("a town already in Hebrew, and one nobody knows", async () => {
  const { hebrewTownFor } = await import("@/app/lib/forms/hebrew-town");

  assert.equal(hebrewTownFor("עראבה"), "עראבה", "she typed it the way it is wanted");
  // Not in the register: the letter map is better than an empty cell
  // somebody has to fill from scratch.
  assert.ok(hebrewTownFor("بلدة غير مسجلة").length > 0);
  assert.equal(hebrewTownFor(""), "");
});
