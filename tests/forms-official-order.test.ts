import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("الترتيب: شمال ← مركز ← جنوب ← القدس ← الضفة، واللي بلا منطقة بالآخر", async () => {
  const { officialOrder } = await import("@/app/lib/forms/regions");
  const plan = officialOrder([
    { id: 1, city: "القدس" },
    { id: 2, city: "رهط" },
    { id: 3, city: "الطيبة" },
    { id: 4, city: "سخنين" },
    { id: 5, city: "بلد ما بنعرفها" },
    { id: 6, city: "البقيعة" },
    { id: 7, city: "رام الله" }
  ]);
  assert.deepEqual(plan.ids, [6, 4, 3, 2, 1, 7, 5]);
  assert.equal(plan.placed, 6);
  assert.deepEqual(plan.unknownTowns, ["بلد ما بنعرفها"]);
});

test("🔴 الضفة منطقة لحالها — مش ذيل القدس", async () => {
  const { placeOf } = await import("@/app/lib/forms/regions");
  // داخل الخط الأخضر.
  for (const town of ["القدس", "بيت صفافا", "الجديرة", "عين رافا"]) {
    assert.equal(placeOf(town)?.region, "jerusalem", town);
  }
  // برّا — بدها ناقل تاني، فما بتتلمّ مع القدس بنفس الكتلة.
  for (const town of ["رام الله", "نابلس", "طولكرم", "بيت لحم"]) {
    assert.equal(placeOf(town)?.region, "westbank", town);
  }
});

test("الاسم بينلقط مهما انكتب — بالعبري، بلا «ال»، بهمزة أو بلا", async () => {
  const { placeOf } = await import("@/app/lib/forms/regions");
  assert.equal(placeOf("סח'נין")?.region, "north");
  assert.equal(placeOf("تل ابيب")?.region, "center");
  assert.equal(placeOf("تل أبيب - يافا")?.region, "center");
  assert.equal(placeOf("ناصرة")?.region, "north");
  assert.equal(placeOf("ירושלים")?.region, "jerusalem");
  // البلد العربية بتسبق، والعبرية احتياط لما تكون الأولى فاضية.
  assert.equal(placeOf("", "רהט")?.region, "south");
  assert.equal(placeOf("مش بلد"), null);
});

test("الطيبة بالمركز والطيبة (المرج) بالشمال — اسمين متشابهين بمنطقتين", async () => {
  const { placeOf } = await import("@/app/lib/forms/regions");
  assert.equal(placeOf("الطيبة")?.region, "center");
  assert.equal(placeOf("الطيبة (المرج)")?.region, "north");
});

test("جدول التقرير بيقرا الترتيب المحفوظ — مش listSubmissions لحالها", async () => {
  const { createForm, listFields, listSubmissions, setSubmissionOrder, submitForm } = await import(
    "@/app/lib/forms/store"
  );
  const { submissionGrid } = await import("@/app/lib/forms/report");
  const { createGroup } = await import("@/app/lib/db");

  const group = createGroup("جدول");
  const form = createForm({ name: "جدول", groupId: group.id, fromTemplate: true });
  const fields = listFields(form.id);
  for (const [index, name] of ["وحدة", "تنتين", "تلاتة"].entries()) {
    const values: Record<string, string> = {};
    for (const field of fields) {
      if (field.label.includes("الاسم الكامل")) values[String(field.id)] = name;
      else if (field.label.includes("رقم الهاتف")) values[String(field.id)] = `05033344${index}${index}`;
      else if (!field.required) continue;
      else if (field.options.length) values[String(field.id)] = field.options[field.options.length - 1];
      else values[String(field.id)] = "—";
    }
    assert.equal(submitForm(form.token, values, { requirePhoneCode: false }).ok, true);
  }

  const ids = listSubmissions({ formId: form.id }).map((row) => row.id);
  setSubmissionOrder(form.id, [ids[1], ids[2], ids[0]]);

  // 🔴 هاد هو اللي انكسر أول مرة: الترتيب انحفظ والجدول ضل يقرا بالقديم.
  assert.deepEqual(
    submissionGrid(form.id).rows.map((row) => row.submissionId),
    [ids[1], ids[2], ids[0]]
  );
});

test("البلاد اللي انضافت من دفعات جديدة بتلاقي محلها", async () => {
  const { placeOf } = await import("@/app/lib/forms/regions");
  for (const town of ["أم الفحم", "ام الفحم", "عبلين", "אעבלין", "بيت لحم", "كفر كنا", "نابلس", "أبو قويدر"]) {
    assert.ok(placeOf(town), `«${town}» بلا منطقة — بتنزل بآخر مسار التوصيل`);
  }
  assert.equal(placeOf("أم الفحم")?.region, "north");
  assert.equal(placeOf("عبلين")?.region, "north");
});
