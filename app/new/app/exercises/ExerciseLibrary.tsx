"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppExercise } from "@/app/lib/afkar-app/training";

const CATEGORY: Record<string, string> = { strength: "قوة", cardio: "كارديو", mobility: "مرونة", other: "غير ذلك" };

/** Afkar's team adds exercises and archives old ones; archived ones leave the pickers but stay in every log. */
export function ExerciseLibrary({ exercises, canEdit }: { exercises: AppExercise[]; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", category: "strength", unit: "reps", howto: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/app-exercises", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).catch(() => null);
    setBusy(false);
    if (!response?.ok) return setError(response?.status === 400 ? "اكتبي اسماً واختاري النوع والعدّ." : "التطبيق لا يرد الآن.");
    setForm({ ...form, name: "", howto: "" });
    router.refresh();
  }

  async function archive(id: string, archived: boolean) {
    const response = await fetch(`/api/app-exercises/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived }) }).catch(() => null);
    if (response?.ok) router.refresh();
    else setError("لم يُحفظ — حاولي مرة أخرى.");
  }

  const live = exercises.filter((e) => !e.archived);
  const old = exercises.filter((e) => e.archived);
  return (
    <>
      {canEdit && (
        <section className="crmCard" data-tone="forest">
          <header><span className="crmDot" /><h2>تمرين جديد</h2></header>
          <div className="crmPad" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="crmField" style={{ flex: 1, minWidth: 180 }}><span>الاسم كما يظهر للمنتسبات</span><input maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} value={form.name} /></label>
              <label className="crmField"><span>النوع</span>
                <select onChange={(e) => setForm({ ...form, category: e.target.value })} value={form.category}>
                  {Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="crmField"><span>يُعدّ</span>
                <select onChange={(e) => setForm({ ...form, unit: e.target.value })} value={form.unit}>
                  <option value="reps">جولات × تكرارات</option><option value="minutes">بالدقائق</option>
                </select>
              </label>
            </div>
            <label className="crmField"><span>كيف يُؤدّى (يظهر لها تحت التمرين)</span><input maxLength={1000} onChange={(e) => setForm({ ...form, howto: e.target.value })} value={form.howto} /></label>
            <button className="crmBtn primary" disabled={busy || !form.name.trim()} onClick={() => void add()} type="button">{busy ? "لحظة…" : "أضيفي للمكتبة"}</button>
            {error && <p className="crmEmpty">{error}</p>}
          </div>
        </section>
      )}
      <section className="crmCard" data-tone="sage">
        <header><span className="crmDot" /><h2>التمارين</h2><span className="crmPill tone spacer">{live.length}</span></header>
        {live.length === 0 ? <p className="crmEmpty">لا تمارين بعد.</p> : live.map((e) => (
          <div className="crmRow" key={e.id}>
            <span className="grow">
              <span className="crmRowTitle" style={{ display: "block" }}>{e.name.ar}</span>
              <span className="crmRowDetail" style={{ display: "block" }}>{CATEGORY[e.category] ?? e.category} · {e.unit === "minutes" ? "بالدقائق" : "تكرارات"}{e.howto ? ` · ${e.howto}` : ""}</span>
            </span>
            {canEdit && <button className="crmBtn quiet" onClick={() => void archive(e.id, true)} type="button">أرشفة</button>}
          </div>
        ))}
      </section>
      {old.length > 0 && (
        <section className="crmCard" data-tone="clay">
          <header><span className="crmDot" /><h2>مؤرشفة</h2></header>
          {old.map((e) => (
            <div className="crmRow" key={e.id}>
              <span className="grow"><span className="crmRowTitle">{e.name.ar}</span></span>
              {canEdit && <button className="crmBtn quiet" onClick={() => void archive(e.id, false)} type="button">إرجاع</button>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
