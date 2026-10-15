import test from "node:test";
import assert from "node:assert/strict";

test("only Afkar's own team approves products — a coach doesn't edit the library", async () => {
  const { canHandleProducts } = await import("@/app/lib/afkar-app/queues");
  assert.equal(canHandleProducts("owner"), true);
  assert.equal(canHandleProducts("assistant"), true);
  assert.equal(canHandleProducts("developer"), true);
  assert.equal(canHandleProducts("coach"), false);
  assert.equal(canHandleProducts("whatever"), false, "unknown roles get the narrowest seat");
});

test("resolving a photo: an outcome is required, a message is optional and trimmed", async () => {
  const { resolvePayload } = await import("@/app/lib/afkar-app/queues");
  assert.deepEqual(resolvePayload({ outcome: "added" }), { outcome: "added" });
  assert.deepEqual(resolvePayload({ outcome: "not_added", message: "  هاي مش أكل  " }), { outcome: "not_added", message: "هاي مش أكل" });
  assert.deepEqual(resolvePayload({ outcome: "not_added", message: "   " }), { outcome: "not_added" }, "blank = the default text");
  assert.equal(resolvePayload({ outcome: "maybe" }), null);
  assert.equal(resolvePayload({ outcome: "added", message: "x".repeat(301) }), null, "the app caps it at 300");
});

test("approving a product: Afkar's edited values, sane numbers, an optional home portion", async () => {
  const { approvePayload } = await import("@/app/lib/afkar-app/queues");
  const ok = approvePayload({ name: " لبنة 5% ", kcal: "160", protein: "8", carb: "4", fat: "12", portionLabel: "معلقة", portionGrams: "15" });
  assert.deepEqual(ok, {
    ok: true,
    body: {
      name: { ar: "لبنة 5%" },
      per100: { kcal: 160, protein: 8, carb: 4, fat: 12 },
      portions: [{ label: { ar: "معلقة" }, grams: 15 }]
    }
  });
  const noPortion = approvePayload({ name: "حمص", kcal: "250", protein: "7", carb: "14", fat: "18", portionLabel: "", portionGrams: "" });
  assert.ok(noPortion.ok && noPortion.body.portions.length === 0, "logged by grams when there's no portion");
  assert.deepEqual(approvePayload({ name: "", kcal: "1", protein: "1", carb: "1", fat: "1" }), { ok: false, error: "NAME" });
  assert.deepEqual(approvePayload({ name: "x", kcal: "950", protein: "1", carb: "1", fat: "1" }), { ok: false, error: "VALUES" }, "nothing is over 900 kcal per 100g");
  assert.deepEqual(approvePayload({ name: "x", kcal: "100", protein: "-1", carb: "1", fat: "1" }), { ok: false, error: "VALUES" });
  assert.deepEqual(approvePayload({ name: "x", kcal: "100", protein: "60", carb: "30", fat: "20" }), { ok: false, error: "VALUES" }, "macros can't add up past 100g");
  assert.deepEqual(approvePayload({ name: "x", kcal: "100", protein: "1", carb: "1", fat: "1", portionLabel: "حبة", portionGrams: "" }), { ok: false, error: "PORTION" }, "a portion needs both label and grams");
  assert.deepEqual(approvePayload({ name: "x", kcal: "100", protein: "1", carb: "1", fat: "1", portionLabel: "حبة", portionGrams: "5000" }), { ok: false, error: "PORTION" });
});

test("the photo queue shows only members this user may see (the same list /new/app shows)", async () => {
  const { visibleReviews } = await import("@/app/lib/afkar-app/queues");
  const reviews = [
    { id: "r1", note: "", status: "open", at: "2026-10-15T10:00:00Z", member: { id: "m1", display_name: "ريم", phone_e164: null } },
    { id: "r2", note: "", status: "open", at: "2026-10-15T11:00:00Z", member: { id: "m2", display_name: "سارة", phone_e164: null } }
  ];
  // Already filtered by visibleAppMembers: m2 isn't hers.
  const visible = [{ id: "m1", afkarwts_person_id: "1" }];
  assert.deepEqual(visibleReviews(reviews, visible).map((r) => [r.id, r.personId]), [["r1", "1"]]);
});
