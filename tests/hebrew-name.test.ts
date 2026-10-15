import test from "node:test";
import assert from "node:assert/strict";

test("an Arabic name comes across in Hebrew letters", async () => {
  const { hebrewNameFor } = await import("@/app/lib/forms/hebrew-name");

  assert.equal(hebrewNameFor("سناء حاج"), "סנאא חאג'");
  assert.equal(hebrewNameFor("ليلى عوض"), "לילא עוץ'");
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

  assert.equal(hebrewNameFor("מנאר בוירات"), "מנאר בוירات".replace("ات", "ات"));
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
