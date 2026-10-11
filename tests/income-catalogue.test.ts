import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("the five programmes are مسارات and everything else is an إضافة", async () => {
  const { readItem } = await import("@/app/lib/income/catalogue");

  // Wisam, 2026-10-11: «كلين واكسترا واوشن كلين وكلاسيك وتوب مسارات
  // والباقي اضافات» — Shaper is a product and STEP is sold beside a مسار.
  for (const name of ["CLEAN", "EXTRA+", "OCEAN CLEAN", "CLASSIC", "TOP"]) {
    assert.equal(readItem(name).path, name, `${name} is a مسار`);
  }

  for (const name of ["Shaper", "shaper", "STEP", "משלוחים", "השלמת תשלום", "צילומים", "BOOST"]) {
    assert.equal(readItem(name).path, null, `${name} is not a مسار`);
  }
});

test("«OCEAN CLEAN» is not a clean week", async () => {
  const { readItem } = await import("@/app/lib/income/catalogue");

  // It contains the word, so the longer name has to be tried first — or
  // every ocean week files itself under CLEAN and the figures lie.
  assert.equal(readItem("OCEAN CLEAN").path, "OCEAN CLEAN");
});

test("one line can be a مسار and an إضافة at once", async () => {
  const { readItem } = await import("@/app/lib/income/catalogue");

  assert.deepEqual(readItem("CLEAN & SHAPER"), { path: "CLEAN", extras: ["شيبر"] });
  assert.deepEqual(readItem("Clean +משלוח"), { path: "CLEAN", extras: ["شحن"] });
  // Hebrew and Arabic spellings of the same week.
  assert.deepEqual(readItem("קלין 10%+משלוח"), { path: "CLEAN", extras: ["شحن"] });
});

test("a Hebrew word in its plural still reads", async () => {
  const { readItem } = await import("@/app/lib/income/catalogue");

  // «צילום» ends in a final mem and «צילומים» carries the medial one: one
  // pattern missed the other and two photo days went uncounted.
  assert.deepEqual(readItem("צילום").extras, ["تصوير"]);
  assert.deepEqual(readItem("צילומים").extras, ["تصوير"]);
  assert.deepEqual(readItem("4 ימי צילום").extras, ["تصوير"]);
});

test("a line nobody has classified is neither", async () => {
  const { readItem } = await import("@/app/lib/income/catalogue");

  assert.deepEqual(readItem("רזאו דיב"), { path: null, extras: [] });
  assert.deepEqual(readItem(""), { path: null, extras: [] });
});
