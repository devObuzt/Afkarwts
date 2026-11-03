"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { nutritionError, parseAmount, type AppFood, type Text, type AppTemplate, type AppTemplateRow, type SlotForm, type SlotType } from "@/app/lib/afkar-app/nutrition";
import { FoodPicker } from "../FoodPicker";

const SLOTS: Record<SlotType, string> = { protein: "بروتين", carb: "نشويات", veg: "خضار", fat: "دهون", drink: "مشروبات", other: "غير ذلك" };

type Form = { name: string; time: string; note: string; name_text?: Text; note_text?: Text | null; slots: SlotForm[] };
const BLANK: Form = { name: "", time: "", note: "", slots: [] };

function kcalOf(foods: Map<string, AppFood>, foodId: string, portionId: string, qty: string) {
  const food = foods.get(foodId);
  const portion = food?.portions.find((p) => p.id === portionId);
  const n = parseAmount(qty) ?? 0;
  return food && portion && n > 0 ? Math.round((food.per100.kcal * portion.grams * n) / 100) : 0;
}

/** A meal is its slots; each slot has a main food and its alternatives. An alternative's amount left empty is counted from the values. */
export function TemplateEditor({ templates, canEdit }: { templates: AppTemplateRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(BLANK);
  const [foods, setFoods] = useState<Map<string, AppFood>>(new Map());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const editor = useRef<HTMLElement>(null);

  // The editor opens under the list: a long list would hide that anything happened.
  useEffect(() => { if (editing) editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editing]);

  const remember = (food: AppFood) => setFoods((all) => new Map(all).set(food.id, food));
  const setSlot = (i: number, patch: Partial<SlotForm>) => {
    setForm((f) => ({ ...f, slots: f.slots.map((s, n) => (n === i ? { ...s, ...patch } : s)) }));
    setMessage(null);
  };

  async function open(id: string) {
    setMessage(null);
    const response = await fetch(`/api/app-templates/${id}`, { cache: "no-store" }).catch(() => null);
    const body = response?.ok ? ((await response.json().catch(() => null)) as { template: AppTemplate; foods: AppFood[] } | null) : null;
    if (!body) return setMessage({ ok: false, text: nutritionError("UNREACHABLE") });
    setFoods(new Map(body.foods.map((f) => [f.id, f])));
    setForm({
      name: body.template.name.ar, name_text: body.template.name, note_text: body.template.note, time: body.template.default_time ?? "", note: body.template.note?.ar ?? "",
      slots: body.template.slots.map((s) => ({
        slot_type: s.slot_type, food_id: s.food_id, portion_id: s.portion_id, qty: String(s.qty),
        // Only amounts typed by hand are kept as typed; the rest recount when the main food changes.
        alternatives: s.alternatives.map((a) => ({ food_id: a.food_id, portion_id: a.portion_id, qty: a.qty_manual ? String(a.qty) : "" }))
      }))
    });
    setEditing(id);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(editing === "new" ? "/api/app-templates" : `/api/app-templates/${editing}`, {
      method: editing === "new" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) return setMessage({ ok: false, text: nutritionError(body.error ?? "UNREACHABLE") + (typeof body.row === "number" ? ` (الخانة ${body.row + 1})` : "") });
    setMessage({ ok: true, text: "حُفظ القالب." });
    setEditing(null);
    setForm(BLANK);
    router.refresh();
  }

  const total = form.slots.reduce((sum, s) => sum + kcalOf(foods, s.food_id, s.portion_id, s.qty), 0);
  return (
    <>
      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" /><h2>القوالب</h2><span className="crmPill tone spacer">{templates.length}</span>
          {canEdit && <button className="crmBtn primary" onClick={() => { setForm(BLANK); setEditing("new"); setMessage(null); }} type="button">+ قالب جديد</button>}
        </header>
        {templates.length === 0 ? <p className="crmEmpty">لا قوالب بعد.</p> : templates.map((t) => (
          <div className="crmRow" key={t.id}>
            <span className="grow">
              <span className="crmRowTitle" style={{ display: "block" }}>{t.name.ar}</span>
              {t.default_time && <span className="crmRowDetail" style={{ display: "block" }}><bdi dir="ltr">{t.default_time}</bdi></span>}
            </span>
            <button className="crmBtn quiet" onClick={() => void open(t.id)} type="button">{canEdit ? "تعديل" : "عرض"}</button>
          </div>
        ))}
        {message && !editing && <p className={message.ok ? "crmRowDetail crmPad" : "crmEmpty"} role="status">{message.text}</p>}
      </section>

      {editing && (
        <section className="crmCard" data-tone="forest" ref={editor} style={{ scrollMarginTop: 60 }}>
          <header>
            <span className="crmDot" /><h2>{editing === "new" ? "قالب جديد" : form.name}</h2>
            {total > 0 && <span className="crmPill tone spacer">سعرات: {total}</span>}
          </header>
          <div className="crmPad" style={{ display: "grid", gap: 12 }}>
            {editing !== "new" && <p className="crmRowDetail">التعديل يصل لمن تُسجَّل من الآن. خطط المنتسبات الحالية لا تتغيّر.</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="crmField" style={{ flex: 2, minWidth: 180 }}><span>اسم القالب</span><input disabled={!canEdit} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} value={form.name} /></label>
              <label className="crmField" style={{ width: 120 }}><span>الوقت</span><input dir="ltr" disabled={!canEdit} onChange={(e) => setForm({ ...form, time: e.target.value })} placeholder="08:00" value={form.time} /></label>
              <label className="crmField" style={{ flex: 3, minWidth: 200 }}><span>ملاحظة للمنتسبة</span><input disabled={!canEdit} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} value={form.note} /></label>
            </div>

            {form.slots.map((slot, i) => {
              const main = foods.get(slot.food_id);
              return (
                <div key={i} style={{ display: "grid", gap: 8, padding: 12, border: "1.5px solid var(--line, rgba(0,0,0,.15))", borderRadius: 14 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label className="crmField" style={{ width: 130 }}><span>الخانة</span>
                      <select disabled={!canEdit} onChange={(e) => setSlot(i, { slot_type: e.target.value })} value={slot.slot_type}>
                        {Object.entries(SLOTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <strong style={{ flex: 1, minWidth: 140 }}>{main?.name.ar ?? "اختاري طعاماً"}</strong>
                    {main && (
                      <>
                        <label className="crmField" style={{ width: 90 }}><span>الكمية</span><input disabled={!canEdit} inputMode="decimal" onChange={(e) => setSlot(i, { qty: e.target.value })} value={slot.qty} /></label>
                        <label className="crmField" style={{ width: 150 }}><span>الحصة</span>
                          <select disabled={!canEdit} onChange={(e) => setSlot(i, { portion_id: e.target.value })} value={slot.portion_id}>
                            {main.portions.map((p) => <option key={p.id} value={p.id}>{p.label.ar} ({p.grams} غ)</option>)}
                          </select>
                        </label>
                        <span className="crmRowDetail">سعرات: {kcalOf(foods, slot.food_id, slot.portion_id, slot.qty)}</span>
                      </>
                    )}
                    {canEdit && <button className="crmBtn quiet" onClick={() => setForm({ ...form, slots: form.slots.filter((_, n) => n !== i) })} type="button">إزالة الخانة</button>}
                  </div>
                  {canEdit && <FoodPicker label={main ? "غيّري الطعام الأساسي" : "الطعام الأساسي"} onPick={(food) => { remember(food); setSlot(i, { food_id: food.id, portion_id: food.portions[0]?.id ?? "" }); }} />}
                  {main && (
                    <>
                      <span className="crmRowDetail">البدائل — اتركي الكمية فارغة لتُحسب من القيم.</span>
                      {slot.alternatives.map((alt, a) => {
                        const food = foods.get(alt.food_id);
                        return (
                          <div key={`${alt.food_id}-${a}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <span style={{ flex: 1, minWidth: 140 }}>{food?.name.ar ?? "طعام"}</span>
                            <label className="crmField" style={{ width: 90 }}><span>الكمية</span><input disabled={!canEdit} inputMode="decimal" onChange={(e) => setSlot(i, { alternatives: slot.alternatives.map((x, n) => (n === a ? { ...x, qty: e.target.value } : x)) })} placeholder="تلقائي" value={alt.qty} /></label>
                            <label className="crmField" style={{ width: 150 }}><span>الحصة</span>
                              <select disabled={!canEdit} onChange={(e) => setSlot(i, { alternatives: slot.alternatives.map((x, n) => (n === a ? { ...x, portion_id: e.target.value } : x)) })} value={alt.portion_id}>
                                {food?.portions.map((p) => <option key={p.id} value={p.id}>{p.label.ar} ({p.grams} غ)</option>)}
                              </select>
                            </label>
                            {canEdit && <button className="crmBtn quiet" onClick={() => setSlot(i, { alternatives: slot.alternatives.filter((_, n) => n !== a) })} type="button">إزالة</button>}
                          </div>
                        );
                      })}
                      {canEdit && <FoodPicker label="+ بديل" onPick={(food) => { remember(food); setSlot(i, { alternatives: [...slot.alternatives, { food_id: food.id, portion_id: food.portions[0]?.id ?? "", qty: "" }] }); }} />}
                    </>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="crmBtn quiet" onClick={() => setForm({ ...form, slots: [...form.slots, { slot_type: "protein", food_id: "", portion_id: "", qty: "1", alternatives: [] }] })} type="button">+ خانة</button>
                <button className="crmBtn primary" disabled={busy} onClick={() => void save()} type="button">{busy ? "لحظة…" : "احفظي القالب"}</button>
                <button className="crmBtn quiet" onClick={() => { setEditing(null); setMessage(null); }} type="button">إلغاء</button>
              </div>
            )}
            {message && <p className={message.ok ? "crmRowDetail" : "crmEmpty"} role="status">{message.text}</p>}
          </div>
        </section>
      )}
    </>
  );
}
