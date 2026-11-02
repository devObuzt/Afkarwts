import test from "node:test";
import assert from "node:assert/strict";

test("a food from the form: Arabic name is required, the numbers must be possible, Arabic digits count", async () => {
  const { foodPayload } = await import("@/app/lib/afkar-app/nutrition");
  const form = { ar: " مجدّرة ", he: "מג׳דרה", en: "", synonyms: "مجدرة، مجادرة, mujaddara", category: " نشويات ", kcal: "١٨٠", protein: "7", carb: "28", fat: "5", portions: [{ label: "صحن وسط", grams: "190" }] };
  assert.deepEqual(foodPayload(form), { ok: true, body: {
    name: { ar: "مجدّرة", he: "מג׳דרה" }, synonyms: ["مجدرة", "مجادرة", "mujaddara"], category: "نشويات",
    per100: { kcal: 180, protein: 7, carb: 28, fat: 5 }, portions: [{ label: { ar: "صحن وسط" }, grams: 190 }]
  } });
  assert.deepEqual(foodPayload({ ...form, ar: "  " }), { ok: false, error: "NAME" });
  assert.deepEqual(foodPayload({ ...form, kcal: "" }), { ok: false, error: "VALUES" });
  assert.deepEqual(foodPayload({ ...form, kcal: "1200" }), { ok: false, error: "VALUES" });
  assert.deepEqual(foodPayload({ ...form, protein: "60", carb: "60" }), { ok: false, error: "VALUES" }, "more than 100 g of macros in 100 g");
  assert.deepEqual(foodPayload({ ...form, portions: [{ label: "صحن", grams: "0" }] }), { ok: false, error: "PORTION", row: 0 });
  assert.deepEqual(foodPayload({ ...form, portions: [{ label: "", grams: "100" }] }), { ok: false, error: "PORTION", row: 0 });
});

test("editing a food keeps the ids of its portions, because plans point at them", async () => {
  const { foodPayload } = await import("@/app/lib/afkar-app/nutrition");
  const made = foodPayload({ ar: "رز", he: "", en: "", synonyms: "", category: "", kcal: "130", protein: "3", carb: "28", fat: "0", portions: [{ id: "p1", label: "كاسة", grams: "158" }, { label: "ملعقة", grams: "15" }] });
  assert.ok(made.ok);
  assert.deepEqual(made.body.portions, [{ id: "p1", label: { ar: "كاسة" }, grams: 158 }, { label: { ar: "ملعقة" }, grams: 15 }]);
});

const slot = { slot_type: "protein", food_id: "f1", portion_id: "p1", qty: "1.5", alternatives: [{ food_id: "f2", portion_id: "p2", qty: "" }, { food_id: "f3", portion_id: "p3", qty: "2" }] };

test("a meal template: an alternative left empty is counted by the server, one typed is kept", async () => {
  const { templatePayload } = await import("@/app/lib/afkar-app/nutrition");
  assert.deepEqual(templatePayload({ name: " فطور ", time: "08:00", note: "", slots: [slot] }), { ok: true, body: {
    name: { ar: "فطور" }, default_time: "08:00",
    slots: [{ slot_type: "protein", food_id: "f1", portion_id: "p1", qty: 1.5, alternatives: [{ food_id: "f2", portion_id: "p2" }, { food_id: "f3", portion_id: "p3", qty: 2 }] }]
  } });
  assert.deepEqual(templatePayload({ name: "", time: "", note: "", slots: [slot] }), { ok: false, error: "NAME" });
  assert.deepEqual(templatePayload({ name: "x", time: "25:00", note: "", slots: [slot] }), { ok: false, error: "TIME" });
  assert.deepEqual(templatePayload({ name: "x", time: "", note: "", slots: [] }), { ok: false, error: "EMPTY" });
  assert.deepEqual(templatePayload({ name: "x", time: "", note: "", slots: [{ ...slot, qty: "0" }] }), { ok: false, error: "QTY", row: 0 });
  assert.deepEqual(templatePayload({ name: "x", time: "", note: "", slots: [{ ...slot, food_id: "" }] }), { ok: false, error: "FOOD", row: 0 });
  assert.deepEqual(templatePayload({ name: "x", time: "", note: "", slots: [{ ...slot, alternatives: [{ food_id: "f2", portion_id: "p2", qty: "-1" }] }] }), { ok: false, error: "QTY", row: 0 });
});

const program = { key: "clean-week", name: "Clean Week", length_days: "7", weigh_in: "1, 7", teen_mode: false, goals: { kcal: "1500", protein: "110", carb: "", fat: "" }, days: [{ meal_template_ids: ["t1", "t2"], content: " الماي قبل الأكل " }, { meal_template_ids: ["t1"], content: "" }] };

test("a program: days are typed from 1 and stored from 0", async () => {
  const { programPayload } = await import("@/app/lib/afkar-app/nutrition");
  assert.deepEqual(programPayload(program), { ok: true, body: {
    key: "clean-week", name: { ar: "Clean Week" }, length_days: 7, weigh_in_days: [0, 6], teen_mode: false, goals: { kcal: 1500, protein: 110 },
    days: [{ meal_template_ids: ["t1", "t2"], content: { ar: "الماي قبل الأكل" } }, { meal_template_ids: ["t1"] }]
  } });
  assert.deepEqual(programPayload({ ...program, key: "كلين" }), { ok: false, error: "KEY" });
  assert.deepEqual(programPayload({ ...program, length_days: "0" }), { ok: false, error: "LENGTH" });
  assert.deepEqual(programPayload({ ...program, weigh_in: "8" }), { ok: false, error: "WEIGH_IN" }, "day 8 of 7");
  assert.deepEqual(programPayload({ ...program, weigh_in: "0" }), { ok: false, error: "WEIGH_IN" });
  assert.deepEqual(programPayload({ ...program, days: [{ meal_template_ids: [], content: "" }] }), { ok: false, error: "DAY", row: 0 });
  assert.deepEqual(programPayload({ ...program, goals: { kcal: "9000", protein: "", carb: "", fat: "" } }), { ok: false, error: "GOALS" });
});

test("a teen program carries no goals and no weigh-in, whatever is left in the form", async () => {
  const { programPayload } = await import("@/app/lib/afkar-app/nutrition");
  const teen = programPayload({ ...program, teen_mode: true });
  assert.ok(teen.ok);
  assert.equal(teen.body.teen_mode, true);
  assert.deepEqual(teen.body.weigh_in_days, []);
  assert.equal("goals" in teen.body, false);
});

test("one line of her plan, and her own goals", async () => {
  const { planItemPayload, goalsPayload } = await import("@/app/lib/afkar-app/nutrition");
  assert.deepEqual(planItemPayload({ food_id: "f1", portion_id: "p1", qty: "2", alternatives: [{ food_id: "f2", portion_id: "p2", qty: "" }] }), {
    ok: true, body: { food_id: "f1", portion_id: "p1", qty: 2, alternatives: [{ food_id: "f2", portion_id: "p2" }] }
  });
  assert.deepEqual(planItemPayload({ food_id: "f1", portion_id: "p1", qty: "", alternatives: [] }), { ok: false, error: "QTY" });
  assert.deepEqual(goalsPayload({ kcal: "1600", protein: "", carb: "", fat: "٥٠" }), { ok: true, goals: { kcal: 1600, fat: 50 } });
  assert.deepEqual(goalsPayload({ kcal: "1600.5", protein: "", carb: "", fat: "" }), { ok: false, error: "GOALS" });
});

test("what the form doesn't show survives a save: other languages stay, real foods from the database still save", async () => {
  const { foodPayload, templatePayload, programPayload, parseAmount } = await import("@/app/lib/afkar-app/nutrition");
  const food = { ar: "زيت", he: "", en: "", synonyms: "", category: "", kcal: "884", protein: "0", carb: "0.1", fat: "100", portions: [{ id: "p1", label: "ملعقة", grams: "0.05", text: { ar: "قديم", he: "כף" } }] };
  const saved = foodPayload(food);
  assert.ok(saved.ok, "macros of 100.1 and a 0.05 g portion are in the real library");
  assert.deepEqual(saved.body.portions[0], { id: "p1", label: { ar: "ملعقة", he: "כף" }, grams: 0.05 });
  assert.deepEqual(foodPayload({ ...food, protein: "5" }), { ok: false, error: "VALUES" });

  const t = templatePayload({ name: "فطور", time: "٠٨:٠٠", note: "ن", name_text: { ar: "ق", he: "ארוחה" }, note_text: { ar: "ق", en: "note" }, slots: [{ slot_type: "veg", food_id: "f", portion_id: "p", qty: "١", alternatives: [] }] });
  assert.ok(t.ok, "Arabic-keyboard digits in the time");
  assert.equal(t.body.default_time, "08:00");
  assert.deepEqual(t.body.name, { ar: "فطور", he: "ארוחה" });
  assert.deepEqual(t.body.note, { ar: "ن", en: "note" });

  const p = programPayload({ key: "ab", name: "م", name_text: { ar: "ق", he: "מסלול" }, length_days: "7", weigh_in: "", teen_mode: false, goals: { kcal: "", protein: "", carb: "", fat: "" }, days: [{ meal_template_ids: ["t"], content: "ج", content_text: { ar: "ق", he: "תוכן" } }] });
  assert.ok(p.ok);
  assert.deepEqual(p.body.name, { ar: "م", he: "מסלול" });
  assert.deepEqual(p.body.days[0]!.content, { ar: "ج", he: "תוכן" });
  assert.equal(parseAmount("١٫٥"), 1.5);
});
