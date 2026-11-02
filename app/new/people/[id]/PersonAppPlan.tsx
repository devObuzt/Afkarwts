"use client";

import { useCallback, useEffect, useState } from "react";
import { nutritionError, type AltForm, type AppDay, type AppDayItem, type AppFood, type Goals, type GoalsForm } from "@/app/lib/afkar-app/nutrition";
import { FoodPicker } from "@/app/new/app/FoodPicker";

type Plan = { id: string; program_key: string; starts_on: string; name: string; status: string; goals: Goals | null; teen_mode: boolean };
type View = { state: "loading" } | { state: "off" } | { state: "error" } | { state: "ready"; day: AppDay; plans: Plan[] };
type Edit = {
  id: string; name: string; food_id: string; portion_id: string; qty: string; portions: Array<{ id: string; label: { ar: string }; grams: number }>;
  alternatives: Array<AltForm & { name: string; portions: Array<{ id: string; label: { ar: string }; grams: number }> }> | null;
};

const SLOT: Record<string, string> = { protein: "بروتين", carb: "نشويات", veg: "خضار", fat: "دهون", drink: "مشروبات", other: "غير ذلك" };
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const goalsForm = (g?: Goals | null): GoalsForm => ({ kcal: String(g?.kcal ?? ""), protein: String(g?.protein ?? ""), carb: String(g?.carb ?? ""), fat: String(g?.fat ?? "") });

/** She can have more than one plan: the one that counts is the one this day came from. */
const planOf = (day: AppDay, plans: Plan[]) => plans.find((p) => p.program_key === day.program?.key && p.starts_on === day.starts_on);

/** Her food plan, day by day: what's on it, its numbers, and changes for her alone. */
export function PersonAppPlan({ memberId, canEdit }: { memberId: number; canEdit: boolean }) {
  const [view, setView] = useState<View>({ state: "loading" });
  const [date, setDate] = useState(today());
  const [edit, setEdit] = useState<Edit | null>(null);
  const [goals, setGoals] = useState<GoalsForm>(goalsForm());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (on: string) => {
    const response = await fetch(`/api/people/${memberId}/app/plan?date=${on}`, { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    // No app, no account there, or not hers to see: no card rather than a misleading error.
    if (!response || !body) return setView({ state: "error" });
    if (body.configured === false || [403, 404].includes(response.status)) return setView({ state: "off" });
    if (!response.ok) return setView({ state: "error" });
    setView({ state: "ready", day: body.day, plans: body.plans });
    setGoals(goalsForm(planOf(body.day, body.plans)?.goals));
  }, [memberId]);

  useEffect(() => { void load(date); }, [load, date]);
  if (view.state === "off") return null;

  const active = view.state === "ready" ? planOf(view.day, view.plans) : undefined;

  function startEdit(item: AppDayItem) {
    setMessage(null);
    setEdit({ id: item.id, name: item.food.name.ar, food_id: item.food.id, portion_id: item.portion.id, qty: String(item.qty), portions: [item.portion], alternatives: null });
    // The day view names only the chosen portion; the food itself has the rest.
    void fetch(`/api/app-foods/${item.food.id}`).then((r) => (r.ok ? r.json() : null)).then((food: AppFood | null) => {
      if (food) setEdit((e) => (e?.id === item.id && e.food_id === food.id ? { ...e, portions: food.portions } : e));
    }).catch(() => null);
  }

  /** The list of alternatives is only sent once it's touched: left alone, the app recounts them from the main food. */
  function altsFor(item: AppDayItem, e: Edit) {
    return e.alternatives ?? item.alternatives.map((a) => ({ food_id: a.food.id, portion_id: a.portion.id, qty: String(a.qty), name: a.food.name.ar, portions: [a.portion] }));
  }

  async function saveItem(item: AppDayItem, e: Edit) {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/people/${memberId}/app/plan`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: item.id, date, food_id: e.food_id, portion_id: e.portion_id, qty: e.qty,
        ...(e.alternatives ? { alternatives: e.alternatives.map(({ food_id, portion_id, qty }) => ({ food_id, portion_id, qty })) } : {})
      })
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) return setMessage({ ok: false, text: nutritionError(body.error ?? "UNREACHABLE") });
    setEdit(null);
    setMessage({ ok: true, text: "حُفظ لها. القالب لم يتغيّر." });
    await load(date);
  }

  async function saveGoals() {
    if (!active) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/people/${memberId}/app/plan`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan_id: active.id, goals })
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) return setMessage({ ok: false, text: nutritionError(body.error ?? "UNREACHABLE") });
    setMessage({ ok: true, text: "حُفظت أهدافها." });
    await load(date);
  }

  const day = view.state === "ready" ? view.day : null;
  return (
    <section className="crmCard" data-tone="sage">
      <header><span className="crmDot" /><h2>خطة التغذية بالتطبيق</h2></header>
      {view.state === "loading" && <p className="crmEmpty">جارٍ التحميل…</p>}
      {view.state === "error" && <p className="crmEmpty">التطبيق لا يرد الآن.</p>}
      {day && (
        <div className="crmPad" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <button aria-label="اليوم السابق" className="crmBtn quiet" onClick={() => { setEdit(null); setDate(shift(date, -1)); }} type="button">›</button>
            <label className="crmField"><span>اليوم</span><input dir="ltr" onChange={(e) => { if (e.target.value) { setEdit(null); setDate(e.target.value); } }} type="date" value={date} /></label>
            <button aria-label="اليوم التالي" className="crmBtn quiet" onClick={() => { setEdit(null); setDate(shift(date, 1)); }} type="button">‹</button>
            {day.program && <span className="crmRowDetail">{day.program.name.ar}{day.day_index !== null ? ` · يوم ${day.day_index + 1}` : ""}{day.is_weigh_in ? " · يوم وزن" : ""}</span>}
          </div>

          {day.status === "no_plan" && <p className="crmEmpty">لا مسار لها في هذا اليوم.</p>}
          {day.status !== "active" && day.status !== "no_plan" && <p className="crmEmpty">{day.status === "before_start" ? "مسارها لم يبدأ في هذا اليوم." : day.status === "finished" ? "انتهى مسارها قبل هذا اليوم." : "لا خطة في هذا اليوم."}</p>}
          {day.content && <p className="crmRowDetail">محتوى اليوم: {day.content.ar}</p>}
          {day.totals && day.goals && (
            <p className="crmRowDetail">أكلت اليوم: سعرات {Math.round(day.totals.kcal)}{day.goals.kcal ? ` من ${day.goals.kcal}` : ""} · بروتين {Math.round(day.totals.protein)}{day.goals.protein ? ` من ${day.goals.protein}` : ""} غ</p>
          )}

          {day.meals.map((meal) => (
            <div key={meal.id} style={{ display: "grid", gap: 6, padding: 12, border: "1.5px solid var(--line, rgba(0,0,0,.15))", borderRadius: 14 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <strong style={{ flex: 1 }}>{meal.name.ar}{meal.time ? <> · <bdi dir="ltr">{meal.time.slice(0, 5)}</bdi></> : null}</strong>
                <span className="crmRowDetail">سعرات: {Math.round(meal.items.reduce((sum, i) => sum + (i.values?.kcal ?? 0), 0))}</span>
              </div>
              {meal.note && <span className="crmRowDetail">{meal.note.ar}</span>}
              {meal.items.map((item) => {
                const open = edit?.id === item.id ? edit : null;
                const alts = open ? altsFor(item, open) : [];
                return (
                  <div key={item.id} style={{ display: "grid", gap: 8, paddingTop: 6, borderTop: "1px solid var(--line, rgba(0,0,0,.08))" }}>
                    <div className="crmRow" style={{ padding: 0, border: "none" }}>
                      <span className="grow">
                        <span className="crmRowTitle" style={{ display: "block" }}>{SLOT[item.slot_type] ?? item.slot_type}: {item.food.name.ar}</span>
                        <span className="crmRowDetail" style={{ display: "block" }}>{item.portion.label.ar} × {item.qty} · بدائل: {item.alternatives.length}{item.values ? ` · سعرات: ${Math.round(item.values.kcal)}` : ""}</span>
                      </span>
                      {item.logged && <span className="crmPill live">سجّلتها</span>}
                      {canEdit && !open && <button className="crmBtn quiet" onClick={() => startEdit(item)} type="button">تعديل</button>}
                    </div>
                    {open && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <strong>{open.name}</strong>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <label className="crmField" style={{ width: 90 }}><span>الكمية</span><input inputMode="decimal" onChange={(e) => setEdit({ ...open, qty: e.target.value })} value={open.qty} /></label>
                          <label className="crmField" style={{ width: 170 }}><span>الحصة</span>
                            <select onChange={(e) => setEdit({ ...open, portion_id: e.target.value })} value={open.portion_id}>
                              {open.portions.map((p) => <option key={p.id} value={p.id}>{p.label.ar} ({p.grams} غ)</option>)}
                            </select>
                          </label>
                        </div>
                        <FoodPicker label="غيّري الطعام" onPick={(food) => setEdit({ ...open, name: food.name.ar, food_id: food.id, portion_id: food.portions[0]?.id ?? "", portions: food.portions })} />
                        <span className="crmRowDetail">البدائل — اتركي الكمية فارغة لتُحسب من القيم.</span>
                        {alts.map((alt, a) => (
                          <div key={`${alt.food_id}-${a}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                            <span style={{ flex: 1, minWidth: 140 }}>{alt.name} · {alt.portions.find((p) => p.id === alt.portion_id)?.label.ar}</span>
                            <label className="crmField" style={{ width: 90 }}><span>الكمية</span><input inputMode="decimal" onChange={(e) => setEdit({ ...open, alternatives: alts.map((x, n) => (n === a ? { ...x, qty: e.target.value } : x)) })} placeholder="تلقائي" value={alt.qty} /></label>
                            <button className="crmBtn quiet" onClick={() => setEdit({ ...open, alternatives: alts.filter((_, n) => n !== a) })} type="button">إزالة</button>
                          </div>
                        ))}
                        <FoodPicker label="+ بديل" onPick={(food) => setEdit({ ...open, alternatives: [...alts, { food_id: food.id, portion_id: food.portions[0]?.id ?? "", qty: "", name: food.name.ar, portions: food.portions }] })} />
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button className="crmBtn primary" disabled={busy} onClick={() => void saveItem(item, open)} type="button">{busy ? "لحظة…" : "احفظي لها"}</button>
                          <button className="crmBtn quiet" onClick={() => setEdit(null)} type="button">إلغاء</button>
                        </div>
                        <span className="crmRowDetail">يتغيّر عندها في كل مرة يتكرر فيها هذا اليوم من الدورة. القالب لا يتغيّر.</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {active && !active.teen_mode && canEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              {([["kcal", "هدف سعرات"], ["protein", "بروتين (غ)"], ["carb", "كربوهيدرات (غ)"], ["fat", "دهون (غ)"]] as const).map(([key, label]) => (
                <label className="crmField" key={key} style={{ width: 110 }}><span>{label}</span><input inputMode="numeric" onChange={(e) => setGoals({ ...goals, [key]: e.target.value })} value={goals[key]} /></label>
              ))}
              <button className="crmBtn quiet" disabled={busy} onClick={() => void saveGoals()} type="button">احفظي أهدافها</button>
            </div>
          )}
          {active?.teen_mode && <p className="crmRowDetail">مسار مراهقات: الأرقام هنا للفريق فقط، ولا أهداف لها.</p>}
          {message && <p className={message.ok ? "crmRowDetail" : "crmEmpty"} role="status">{message.text}</p>}
        </div>
      )}
    </section>
  );
}
