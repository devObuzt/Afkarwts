"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppExercise, AppPlanItem, AppWorkoutLog } from "@/app/lib/afkar-app/training";

type Row = { exercise_id: string; sets: string; reps: string; minutes: string; weekdays: number[]; note: string };
type View = { state: "loading" } | { state: "off" } | { state: "error" } | { state: "ready"; logs: AppWorkoutLog[]; exercises: AppExercise[]; planUnits: Map<string, AppExercise> };

const DAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const ERROR_TEXT: Record<string, string> = {
  AMOUNT: "كمية ناقصة أو غير معقولة في أحد التمارين.",
  EXERCISE: "تمرين غير موجود في المكتبة.",
  UNREACHABLE: "التطبيق لا يرد الآن."
};

const toRow = (p: AppPlanItem): Row => ({
  exercise_id: p.exercise.id, sets: p.sets?.toString() ?? "", reps: p.reps?.toString() ?? "", minutes: p.minutes?.toString() ?? "",
  weekdays: p.weekdays, note: p.note
});

function amount(a: { sets: number | null; reps: number | null; minutes: number | null; weight_kg?: number | null }) {
  // «label: number» needs no count agreement (1/2/3/11) and can't be flipped by right-to-left.
  const base = a.minutes !== null ? `دقائق: ${a.minutes}` : `جولات: ${a.sets} · تكرارات: ${a.reps}`;
  return a.weight_kg ? `${base} · وزن: ${a.weight_kg} كغ` : base;
}

/** Her training plan in the app (W6): built from Afkar's library, and what she actually did. */
export function PersonAppTraining({ memberId, canEdit }: { memberId: number; canEdit: boolean }) {
  const [view, setView] = useState<View>({ state: "loading" });
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/people/${memberId}/app/training`, { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    // No app, no account there, or not hers to see: no card rather than a misleading error.
    if (!response || !body) return setView({ state: "error" });
    if (body.configured === false || [403, 404].includes(response.status)) return setView({ state: "off" });
    if (!response.ok) return setView({ state: "error" });
    const plan = body.plan as AppPlanItem[];
    setRows(plan.map(toRow));
    setDirty(false);
    setView({ state: "ready", logs: body.logs, exercises: body.exercises, planUnits: new Map(plan.map((p) => [p.exercise.id, p.exercise])) });
  }, [memberId]);

  useEffect(() => { void load(); }, [load]);
  if (view.state === "off") return null;

  const exerciseOf = (id: string) => (view.state === "ready" ? view.exercises.find((e) => e.id === id) ?? view.planUnits.get(id) : undefined);
  const edit = (i: number, patch: Partial<Row>) => { setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r))); setDirty(true); setMessage(null); };

  function add(id: string) {
    const ex = exerciseOf(id);
    if (!ex) return;
    setRows((rs) => [...rs, { exercise_id: id, sets: ex.unit === "reps" ? "3" : "", reps: ex.unit === "reps" ? "10" : "", minutes: ex.unit === "minutes" ? "20" : "", weekdays: [], note: "" }]);
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/people/${memberId}/app/training`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows })
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok) { setMessage({ ok: true, text: "حُفظت — الخطة عندها في التطبيق." }); await load(); }
    else setMessage({ ok: false, text: (ERROR_TEXT[body.error] ?? "لم تُحفظ — حاولي مرة أخرى.") + (typeof body.row === "number" ? ` (السطر ${body.row + 1})` : "") });
  }

  return (
    <section className="crmCard" data-tone="sage">
      <header>
        <span className="crmDot" />
        <h2>تدريب بالتطبيق</h2>
      </header>
      {view.state === "loading" && <p className="crmEmpty">جارٍ التحميل…</p>}
      {view.state === "error" && <p className="crmEmpty">التطبيق لا يرد الآن.</p>}
      {view.state === "ready" && (
        <div className="crmPad" style={{ display: "grid", gap: 12 }}>
          {rows.length === 0 && <p className="crmEmpty">لا خطة تدريب لها بعد.</p>}
          {rows.map((row, i) => {
            const ex = exerciseOf(row.exercise_id);
            return (
              <div key={`${row.exercise_id}-${i}`} style={{ display: "grid", gap: 8, paddingBottom: 10, borderBottom: "1px solid var(--line, rgba(0,0,0,.08))" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <strong style={{ flex: 1 }}>{ex?.name.ar ?? "تمرين"}{ex?.mine ? " (تمرينها)" : ""}</strong>
                  {canEdit && <button className="crmBtn quiet" onClick={() => { setRows((rs) => rs.filter((_, n) => n !== i)); setDirty(true); }} type="button">إزالة</button>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ex?.unit === "minutes" ? (
                    <label className="crmField" style={{ width: 110 }}><span>دقائق</span><input disabled={!canEdit} inputMode="numeric" onChange={(e) => edit(i, { minutes: e.target.value })} value={row.minutes} /></label>
                  ) : (
                    <>
                      <label className="crmField" style={{ width: 90 }}><span>جولات</span><input disabled={!canEdit} inputMode="numeric" onChange={(e) => edit(i, { sets: e.target.value })} value={row.sets} /></label>
                      <label className="crmField" style={{ width: 90 }}><span>تكرارات</span><input disabled={!canEdit} inputMode="numeric" onChange={(e) => edit(i, { reps: e.target.value })} value={row.reps} /></label>
                    </>
                  )}
                  <label className="crmField" style={{ flex: 1, minWidth: 160 }}><span>ملاحظة</span><input disabled={!canEdit} maxLength={200} onChange={(e) => edit(i, { note: e.target.value })} value={row.note} /></label>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} role="group" aria-label="أيام التمرين">
                  <span className="crmRowDetail">أيام:</span>
                  {DAYS.map((d, n) => {
                    const on = row.weekdays.includes(n);
                    return (
                      <button aria-pressed={on} className={on ? "crmBtn primary" : "crmBtn quiet"} disabled={!canEdit} key={d} style={{ padding: "4px 10px" }} type="button"
                        onClick={() => edit(i, { weekdays: on ? row.weekdays.filter((x) => x !== n) : [...row.weekdays, n] })}>
                        {d}
                      </button>
                    );
                  })}
                  {row.weekdays.length === 0 && <span className="crmRowDetail">— كل يوم</span>}
                </div>
              </div>
            );
          })}
          {canEdit && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label className="crmField" style={{ flex: 1, minWidth: 200 }}>
                <span>أضيفي تمريناً من المكتبة</span>
                <select onChange={(e) => { if (e.target.value) add(e.target.value); e.target.value = ""; }} value="">
                  <option value="">اختاري…</option>
                  {view.exercises.map((e) => <option key={e.id} value={e.id}>{e.name.ar} · {e.unit === "minutes" ? "دقائق" : "تكرارات"}</option>)}
                </select>
              </label>
              <button className="crmBtn primary" disabled={busy || !dirty} onClick={() => void save()} type="button">{busy ? "لحظة…" : "احفظي الخطة"}</button>
            </div>
          )}
          {message && <p className="crmEmpty" style={{ color: message.ok ? undefined : "var(--clay, inherit)" }}>{message.text}</p>}
          <div style={{ display: "grid", gap: 4 }}>
            <strong>ما عملته آخر أسبوعين</strong>
            {view.logs.length === 0 ? <span className="crmRowDetail">لم تسجّل تمارين بعد.</span> : view.logs.map((l) => (
              <span className="crmRowDetail" key={l.id}><span dir="ltr">{l.local_date.split("-").reverse().slice(0, 2).join(".")}</span> · {l.exercise.name.ar} · {amount(l)}{l.note ? ` · ${l.note}` : ""}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
