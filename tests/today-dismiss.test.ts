import assert from "node:assert/strict";
import test from "node:test";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

async function openTask() {
  const { createMember, getDb } = await import("@/app/lib/db");
  seq += 1;
  const person = createMember({ name: `مهمة ${seq}`, phone: `+97252777${String(seq).padStart(4, "0")}`, notes: "" })!;
  getDb()
    .prepare("INSERT INTO followups (member_id, kind, state, reason) VALUES (?, 'manual', 'open', 'ما وصلت')")
    .run(person.id);
  const id = (getDb().prepare("SELECT MAX(id) AS id FROM followups").get() as { id: number }).id;
  return { person, key: `task-${id}`, id };
}

const keys = (t: { decisions: Array<{ key: string }> }) => t.decisions.map((d) => d.key);

test("المهمة بتحمل تاريخ فتحها", async () => {
  const { getToday } = await import("@/app/lib/today");
  const { key } = await openTask();
  const item = getToday().decisions.find((d) => d.key === key)!;
  assert.ok(item, "لازم تبيّن بالشاشة");
  assert.match(item.createdAt, /^\d{4}-\d{2}-\d{2}T/, "تاريخ بصيغة ISO مع المنطقة");
  assert.ok(item.updatedAt >= item.createdAt);
});

test("التجاهل بيشيلها من الشاشة وبيخلّيها بالطابور", async () => {
  const { getToday } = await import("@/app/lib/today");
  const { dismissDecision } = await import("@/app/lib/decisions");
  const { getDb } = await import("@/app/lib/db");
  const { key, id } = await openTask();

  assert.ok(keys(getToday()).includes(key));
  dismissDecision(key, 1);
  assert.ok(!keys(getToday()).includes(key), "انشالت من اليوم");

  const still = getDb().prepare("SELECT state FROM followups WHERE id = ?").get(id) as { state: string };
  assert.equal(still.state, "open", "🔑 التجاهل مش حذف — المهمة بتضل مفتوحة بطابورها");
});

/**
 * أخطر حالة: مهمة انتجاهلت وإجاها شغل جديد. لو ضلّت مخفية، الشغل الجديد
 * بيضيع بصمت — وهاد أسوأ من إنها ما انتجاهلت أصلاً.
 */
test("أي حركة جديدة بعد التجاهل بترجّعها", async () => {
  const { getToday } = await import("@/app/lib/today");
  const { dismissDecision } = await import("@/app/lib/decisions");
  const { createForm, listFields, recordSubmission } = await import("@/app/lib/forms/store");
  const { createGroup } = await import("@/app/lib/db");

  seq += 1;
  const group = createGroup(`دفعة ${seq}`);
  const form = createForm({ name: `استمارة ${seq}`, groupId: group.id, fromTemplate: true });
  const fields = listFields(form.id);
  const fill = (phone: string) =>
    recordSubmission(
      form.id,
      fields.map((f) => ({
        fieldId: f.id,
        value:
          f.mapsTo === "name"
            ? "وحدة"
            : f.mapsTo === "phone"
              ? phone
              : f.kind === "choice" || f.kind === "multi" || f.kind === "consent"
                ? f.options[0] ?? ""
                : "جواب"
      }))
    );

  fill(`+97252888${String(seq).padStart(4, "0")}`);
  const key = `form-${form.id}`;
  assert.ok(keys(getToday()).includes(key));

  dismissDecision(key, 1);
  assert.ok(!keys(getToday()).includes(key), "اختفت");

  // تسجيل جديد بعد التجاهل — بما إنّ SQLite بتختم بالثانية، بنقدّم ساعة
  // عشان المقارنة تكون صادقة مش سباق توقيت.
  fill(`+97252889${String(seq).padStart(4, "0")}`);
  const { getDb } = await import("@/app/lib/db");
  getDb()
    .prepare("UPDATE form_submissions SET submitted_at = datetime('now','+1 hour') WHERE form_id = ? AND phone LIKE '+97252889%'")
    .run(form.id);

  assert.ok(keys(getToday()).includes(key), "🔑 شغل جديد = مهمة جديدة، لازم ترجع تبيّن");
});

test("التراجع عن التجاهل بيرجّعها فوراً", async () => {
  const { getToday } = await import("@/app/lib/today");
  const { dismissDecision, restoreDecision } = await import("@/app/lib/decisions");
  const { key } = await openTask();

  dismissDecision(key, 1);
  assert.ok(!keys(getToday()).includes(key));
  restoreDecision(key);
  assert.ok(keys(getToday()).includes(key));
});
