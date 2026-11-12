import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

const rows = (towns: string[]) => towns.map((city) => ({ city }));

test("بلاد متلمّة = مسار اتعدّل، فبينتعلّم", async () => {
  const { townSequence } = await import("@/app/lib/forms/town-order");
  const { normalizeTown } = await import("@/app/lib/forms/regions");
  assert.deepEqual(
    townSequence(rows(["طمرة", "طمرة", "سخنين", "سخنين", "عكا"])),
    ["طمرة", "سخنين", "عكا"].map(normalizeTown)
  );
});

test("🔴 بلد مشقوقة = استثناء لشخص، فما بينتعلّم إشي", async () => {
  const { townSequence } = await import("@/app/lib/forms/town-order");
  // وحدة من عكا انسحبت لفوق لأنها بتيجي تاخد طلبها بالإيد. لو تعلّمنا
  // من هاي، عكا كلها بتنتقل لأول المسار كل دفعة جاية.
  assert.equal(townSequence(rows(["عكا", "طمرة", "طمرة", "سخنين", "عكا"])), null);
});

test("أقل من بلدين ما فيه مسار ينتعلّم", async () => {
  const { townSequence } = await import("@/app/lib/forms/town-order");
  assert.equal(townSequence(rows(["طمرة", "طمرة"])), null);
  assert.equal(townSequence(rows([])), null);
});

test("المتعلَّم بيسبق الملف بالترتيب الرسمي", async () => {
  const { officialOrder, normalizeTown } = await import("@/app/lib/forms/regions");
  const list = [
    { id: 1, city: "القدس" },
    { id: 2, city: "طمرة" },
    { id: 3, city: "رهط" }
  ];

  // بلا تعلّم: شمال ← جنوب ← قدس.
  assert.deepEqual(officialOrder(list).ids, [2, 3, 1]);

  // بعد ما اتعلّم إنّ القدس أول المسار.
  const learned = new Map([
    [normalizeTown("القدس"), 0],
    [normalizeTown("رهط"), 1],
    [normalizeTown("طمرة"), 2]
  ]);
  assert.deepEqual(officialOrder(list, learned).ids, [1, 3, 2]);
});

test("بلد ما انتعلّمت بتضل تاخد محلها من الملف", async () => {
  const { officialOrder, normalizeTown } = await import("@/app/lib/forms/regions");
  const list = [
    { id: 1, city: "طمرة" },
    { id: 2, city: "القدس" }
  ];
  // القدس بس انتعلّمت، وطمرة بتضل على جغرافيتها — والمتعلَّم بيسبق.
  const learned = new Map([[normalizeTown("القدس"), 0]]);
  assert.deepEqual(officialOrder(list, learned).ids, [2, 1]);
});

test("الحفظ بيرجّع كم بلد غيّرت محلها، وصفر لما يكون نفس الإشي", async () => {
  const { saveTownOrder, loadTownOrder, forgetTownOrder } = await import("@/app/lib/forms/town-order");
  forgetTownOrder();
  assert.equal(saveTownOrder(["a", "b", "c"]), 3);
  assert.equal(saveTownOrder(["a", "b", "c"]), 0);
  assert.equal(saveTownOrder(["b", "a", "c"]), 2);
  assert.equal(loadTownOrder().get("b"), 0);
  forgetTownOrder();
  assert.equal(loadTownOrder().size, 0);
});
