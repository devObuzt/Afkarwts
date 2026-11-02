"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AppProgram } from "@/app/lib/afkar-app/person";
import { nutritionError, type AppProgramFull, type AppTemplateRow, type ProgramForm } from "@/app/lib/afkar-app/nutrition";

const BLANK: ProgramForm = { key: "", name: "", length_days: "7", weigh_in: "1, 7", teen_mode: false, goals: { kcal: "", protein: "", carb: "", fat: "" }, days: [{ meal_template_ids: [], content: "" }] };

const toForm = (p: AppProgramFull): ProgramForm => ({
  key: p.key, name: p.name.ar, length_days: String(p.length_days), teen_mode: p.teen_mode,
  weigh_in: p.weigh_in_days.map((d) => d + 1).join(", "), // stored from 0, read from day 1
  goals: { kcal: String(p.goals?.kcal ?? ""), protein: String(p.goals?.protein ?? ""), carb: String(p.goals?.carb ?? ""), fat: String(p.goals?.fat ?? "") },
  days: p.days.map((d) => ({ meal_template_ids: d.meal_template_ids, content: d.content?.ar ?? "" }))
});

/** A program is a cycle of days built from meal templates. Whoever is already on it keeps the copy she got. */
export function ProgramEditor({ programs, templates, canEdit }: { programs: AppProgram[]; templates: AppTemplateRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<ProgramForm>(BLANK);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const editor = useRef<HTMLElement>(null);

  // The editor opens under the list: a long list would hide that anything happened.
  useEffect(() => { if (editing) editor.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editing]);

  const nameOf = (id: string) => templates.find((t) => t.id === id)?.name.ar ?? "قالب";
  const setDay = (i: number, patch: Partial<ProgramForm["days"][number]>) => {
    setForm((f) => ({ ...f, days: f.days.map((d, n) => (n === i ? { ...d, ...patch } : d)) }));
    setMessage(null);
  };

  async function open(id: string, copy = false) {
    setMessage(null);
    const response = await fetch(`/api/app-programs/${id}`, { cache: "no-store" }).catch(() => null);
    const body = response?.ok ? ((await response.json().catch(() => null)) as AppProgramFull | null) : null;
    if (!body) return setMessage({ ok: false, text: nutritionError("UNREACHABLE") });
    const next = toForm(body);
    setForm(copy ? { ...next, key: `${next.key}-2`.slice(0, 40), name: `${next.name} (نسخة)` } : next);
    setEditing(copy ? "new" : id);
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(editing === "new" ? "/api/app-programs" : `/api/app-programs/${editing}`, {
      method: editing === "new" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (!response?.ok) return setMessage({ ok: false, text: nutritionError(body.error ?? "UNREACHABLE") + (typeof body.row === "number" ? ` (يوم ${body.row + 1})` : "") });
    setMessage({ ok: true, text: "حُفظ المسار." });
    setEditing(null);
    setForm(BLANK);
    router.refresh();
  }

  return (
    <>
      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" /><h2>المسارات</h2><span className="crmPill tone spacer">{programs.length}</span>
          {canEdit && <button className="crmBtn primary" onClick={() => { setForm(BLANK); setEditing("new"); setMessage(null); }} type="button">+ مسار جديد</button>}
        </header>
        {programs.length === 0 ? <p className="crmEmpty">لا مسارات بعد.</p> : programs.map((p) => (
          <div className="crmRow" key={p.id}>
            <span className="grow">
              <span className="crmRowTitle" style={{ display: "block" }}>{p.name}</span>
              <span className="crmRowDetail" style={{ display: "block" }}>أيام: {p.length_days}</span>
            </span>
            {canEdit && <button className="crmBtn quiet" onClick={() => void open(p.id, true)} type="button">نسخ كمسار جديد</button>}
            <button className="crmBtn quiet" onClick={() => void open(p.id)} type="button">{canEdit ? "تعديل" : "عرض"}</button>
          </div>
        ))}
        {message && !editing && <p className={message.ok ? "crmRowDetail crmPad" : "crmEmpty"} role="status">{message.text}</p>}
      </section>

      {editing && (
        <section className="crmCard" data-tone="forest" ref={editor} style={{ scrollMarginTop: 60 }}>
          <header><span className="crmDot" /><h2>{editing === "new" ? "مسار جديد" : form.name}</h2></header>
          <div className="crmPad" style={{ display: "grid", gap: 12 }}>
            {editing !== "new" && <p className="crmRowDetail">التعديل يصل لمن تُسجَّل من الآن. من على المسار تحتفظ بخطتها.</p>}
            {templates.length === 0 && <p className="crmEmpty">لا قوالب وجبات بعد — ابدئي من قوالب الوجبات.</p>}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label className="crmField" style={{ flex: 2, minWidth: 180 }}><span>اسم المسار</span><input disabled={!canEdit} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} value={form.name} /></label>
              <label className="crmField" style={{ flex: 1, minWidth: 150 }}><span>رمز بالإنجليزية (لا يتغيّر)</span><input dir="ltr" disabled={!canEdit || editing !== "new"} maxLength={40} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="clean-week" value={form.key} /></label>
              <label className="crmField" style={{ width: 110 }}><span>عدد الأيام</span><input disabled={!canEdit} inputMode="numeric" onChange={(e) => setForm({ ...form, length_days: e.target.value })} value={form.length_days} /></label>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input checked={form.teen_mode} disabled={!canEdit} onChange={(e) => setForm({ ...form, teen_mode: e.target.checked })} style={{ width: 20, height: 20, flex: "none" }} type="checkbox" />
              <span>مسار مراهقات: بلا أرقام وبلا أهداف وبلا وزن وقياسات عندها</span>
            </label>
            {!form.teen_mode && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="crmField" style={{ flex: 1, minWidth: 150 }}><span>أيام الوزن (مثل: 1, 7)</span><input disabled={!canEdit} onChange={(e) => setForm({ ...form, weigh_in: e.target.value })} value={form.weigh_in} /></label>
                {([["kcal", "هدف سعرات"], ["protein", "بروتين (غ)"], ["carb", "كربوهيدرات (غ)"], ["fat", "دهون (غ)"]] as const).map(([key, label]) => (
                  <label className="crmField" key={key} style={{ width: 110 }}><span>{label}</span><input disabled={!canEdit} inputMode="numeric" onChange={(e) => setForm({ ...form, goals: { ...form.goals, [key]: e.target.value } })} value={form.goals[key]} /></label>
                ))}
              </div>
            )}
            <span className="crmRowDetail">إذا كان المسار أطول من الأيام هنا، تتكرر الأيام بالترتيب.</span>
            {form.days.map((day, i) => (
              <div key={i} style={{ display: "grid", gap: 8, padding: 12, border: "1.5px solid var(--line, rgba(0,0,0,.15))", borderRadius: 14 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <strong style={{ flex: 1 }}>يوم {i + 1}</strong>
                  {canEdit && <button className="crmBtn quiet" onClick={() => setForm({ ...form, days: [...form.days.slice(0, i + 1), { ...day }, ...form.days.slice(i + 1)] })} type="button">كرّري اليوم</button>}
                  {canEdit && form.days.length > 1 && <button className="crmBtn quiet" onClick={() => setForm({ ...form, days: form.days.filter((_, n) => n !== i) })} type="button">إزالة</button>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {day.meal_template_ids.map((id, m) => (
                    <button aria-label={`إزالة ${nameOf(id)}`} className="crmBtn quiet" disabled={!canEdit} key={`${id}-${m}`} onClick={() => setDay(i, { meal_template_ids: day.meal_template_ids.filter((_, n) => n !== m) })} type="button">{nameOf(id)} ×</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {canEdit && (
                    <label className="crmField" style={{ flex: 1, minWidth: 170 }}><span>أضيفي وجبة</span>
                      <select onChange={(e) => { if (e.target.value) setDay(i, { meal_template_ids: [...day.meal_template_ids, e.target.value] }); }} value="">
                        <option value="">اختاري قالباً…</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name.ar}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="crmField" style={{ flex: 2, minWidth: 200 }}><span>محتوى اليوم (نصيحة أو رسالة دعم)</span><input disabled={!canEdit} maxLength={200} onChange={(e) => setDay(i, { content: e.target.value })} value={day.content} /></label>
                </div>
              </div>
            ))}
            {canEdit && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="crmBtn quiet" onClick={() => setForm({ ...form, days: [...form.days, { meal_template_ids: [], content: "" }] })} type="button">+ يوم</button>
                <button className="crmBtn primary" disabled={busy} onClick={() => void save()} type="button">{busy ? "لحظة…" : "احفظي المسار"}</button>
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
