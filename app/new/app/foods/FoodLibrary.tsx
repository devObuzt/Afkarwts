"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nutritionError, type AppFood, type FoodForm } from "@/app/lib/afkar-app/nutrition";

const BLANK: FoodForm = { ar: "", he: "", en: "", synonyms: "", category: "", kcal: "", protein: "", carb: "", fat: "", portions: [] };

const toForm = (f: AppFood): FoodForm => ({
  ar: f.name.ar, he: f.name.he ?? "", en: f.name.en ?? "", synonyms: f.synonyms.join("، "), category: f.category ?? "",
  kcal: String(f.per100.kcal), protein: String(f.per100.protein), carb: String(f.per100.carb), fat: String(f.per100.fat),
  portions: f.portions.map((p) => ({ id: p.id, label: p.label.ar, grams: String(p.grams), text: p.label }))
});

/** Afkar's food library: search it, add to it, correct it. A portion can't be removed once saved: plans point at it. */
export function FoodLibrary({ recent, canEdit }: { recent: AppFood[]; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<AppFood[] | null>(null);
  const [form, setForm] = useState<FoodForm>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setFound(null); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/app-foods?q=${encodeURIComponent(query)}`, { signal: controller.signal }).catch(() => null);
      if (controller.signal.aborted) return;
      const body = response?.ok ? ((await response.json().catch(() => null)) as { foods: AppFood[] } | null) : null;
      setFound(body?.foods ?? []);
      if (!body) setMessage({ ok: false, text: nutritionError("UNREACHABLE") });
    }, 250);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [q]);

  const set = (patch: Partial<FoodForm>) => { setForm((f) => ({ ...f, ...patch })); setMessage(null); };
  const setPortion = (i: number, patch: { label?: string; grams?: string }) =>
    set({ portions: form.portions.map((p, n) => (n === i ? { ...p, ...patch } : p)) });

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(editing ? `/api/app-foods/${editing}` : "/api/app-foods", {
      method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) return setMessage({ ok: false, text: nutritionError(body.error ?? "UNREACHABLE") + (typeof body.row === "number" ? ` (الحصة ${body.row + 1})` : "") });
    setMessage({ ok: true, text: editing ? "حُفظ. الخطط التي عُيّنت من قبل تأخذ القيم الجديدة أيضاً." : "أُضيف للمكتبة." });
    setForm(BLANK);
    setEditing(null);
    setQ("");
    router.refresh();
  }

  async function approve(id: string) {
    const response = await fetch(`/api/app-foods/${id}/approve`, { method: "POST" }).catch(() => null);
    if (!response?.ok) return setMessage({ ok: false, text: "لم يُعتمد — حاولي مرة أخرى." });
    setFound((list) => list?.map((f) => (f.id === id ? { ...f, status: "official" } : f)) ?? null);
    router.refresh();
  }

  const list = found ?? recent;
  return (
    <>
      <section className="crmCard" data-tone="sage">
        <header><span className="crmDot" /><h2>{found ? "نتائج البحث" : "آخر ما تغيّر"}</h2><span className="crmPill tone spacer">{list.length}</span></header>
        <div className="crmPad"><label className="crmField"><span>دوّري في المكتبة</span><input onChange={(e) => setQ(e.target.value)} placeholder="مجدّرة، מג׳דרה، mujaddara" value={q} /></label></div>
        {list.length === 0 ? <p className="crmEmpty">لا نتائج.</p> : list.map((f) => (
          <div className="crmRow" key={f.id}>
            <span className="grow">
              <span className="crmRowTitle" style={{ display: "block" }}>{f.name.ar}{f.name.he ? ` · ${f.name.he}` : ""}</span>
              <span className="crmRowDetail" style={{ display: "block" }}>
                {f.category ? `${f.category} · ` : ""}لكل 100 غ: سعرات {f.per100.kcal} · بروتين {f.per100.protein} · كربوهيدرات {f.per100.carb} · دهون {f.per100.fat}
              </span>
              <span className="crmRowDetail" style={{ display: "block" }}>{f.portions.map((p) => `${p.label.ar} = ${p.grams} غ`).join(" · ")}</span>
            </span>
            {f.status === "draft" && <span className="crmPill">مسودة</span>}
            {canEdit && f.status === "draft" && <button className="crmBtn quiet" onClick={() => void approve(f.id)} type="button">اعتماد</button>}
            {canEdit && <button className="crmBtn quiet" onClick={() => { setForm(toForm(f)); setEditing(f.id); setMessage(null); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }} type="button">تعديل</button>}
          </div>
        ))}
      </section>

      {canEdit && (
        <section className="crmCard" data-tone="forest">
          <header><span className="crmDot" /><h2>{editing ? `تعديل: ${form.ar}` : "طعام جديد"}</h2></header>
          <div className="crmPad" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="crmField" style={{ flex: 1, minWidth: 170 }}><span>الاسم بالعربية *</span><input maxLength={200} onChange={(e) => set({ ar: e.target.value })} value={form.ar} /></label>
              <label className="crmField" style={{ flex: 1, minWidth: 170 }}><span>بالعبرية</span><input dir="rtl" maxLength={200} onChange={(e) => set({ he: e.target.value })} value={form.he} /></label>
              <label className="crmField" style={{ flex: 1, minWidth: 170 }}><span>بالإنجليزية</span><input dir="ltr" maxLength={200} onChange={(e) => set({ en: e.target.value })} value={form.en} /></label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="crmField" style={{ flex: 2, minWidth: 220 }}><span>أسماء أخرى للبحث (تفصل بينها فاصلة)</span><input onChange={(e) => set({ synonyms: e.target.value })} value={form.synonyms} /></label>
              <label className="crmField" style={{ flex: 1, minWidth: 140 }}><span>الفئة</span><input maxLength={40} onChange={(e) => set({ category: e.target.value })} value={form.category} /></label>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([["kcal", "سعرات لكل 100 غ"], ["protein", "بروتين (غ)"], ["carb", "كربوهيدرات (غ)"], ["fat", "دهون (غ)"]] as const).map(([key, label]) => (
                <label className="crmField" key={key} style={{ flex: 1, minWidth: 110 }}><span>{label}</span><input inputMode="decimal" onChange={(e) => set({ [key]: e.target.value })} value={form[key]} /></label>
              ))}
            </div>
            <strong>حصص بيتية</strong>
            {form.portions.length === 0 && <p className="crmRowDetail">بلا حصة، يُحفظ بحصة «100 غ».</p>}
            {form.portions.map((portion, i) => (
              <div key={portion.id ?? `new-${i}`} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <label className="crmField" style={{ flex: 1, minWidth: 160 }}><span>الحصة</span><input onChange={(e) => setPortion(i, { label: e.target.value })} placeholder="صحن وسط" value={portion.label} /></label>
                <label className="crmField" style={{ width: 110 }}><span>غرام</span><input inputMode="decimal" onChange={(e) => setPortion(i, { grams: e.target.value })} value={portion.grams} /></label>
                {!portion.id && <button className="crmBtn quiet" onClick={() => set({ portions: form.portions.filter((_, n) => n !== i) })} type="button">إزالة</button>}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="crmBtn quiet" onClick={() => set({ portions: [...form.portions, { label: "", grams: "" }] })} type="button">+ حصة</button>
              <button className="crmBtn primary" disabled={busy} onClick={() => void save()} type="button">{busy ? "لحظة…" : editing ? "احفظي التعديل" : "أضيفي للمكتبة"}</button>
              {editing && <button className="crmBtn quiet" onClick={() => { setForm(BLANK); setEditing(null); setMessage(null); }} type="button">إلغاء</button>}
            </div>
            {message && <p className={message.ok ? "crmRowDetail" : "crmEmpty"} role="status">{message.text}</p>}
          </div>
        </section>
      )}
      {!canEdit && message && <p className="crmEmpty" role="status">{message.text}</p>}
    </>
  );
}
