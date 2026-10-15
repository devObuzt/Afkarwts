"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppMeeting } from "@/app/lib/afkar-app/training";

type View = { state: "loading" } | { state: "off" } | { state: "error" } | { state: "ready"; meetings: AppMeeting[] };

const KIND: Record<AppMeeting["kind"], string> = { video: "فيديو", phone: "مكالمة", in_person: "وجهاً لوجه" };
const ERROR_TEXT: Record<string, string> = {
  WHEN: "التاريخ أو الساعة غير صالحين.",
  PAST: "الموعد مضى — اختاري موعداً قادماً.",
  DURATION: "المدة بين 5 و240 دقيقة.",
  LINK: "اجتماع الفيديو يحتاج رابطاً يبدأ بـ https://",
  TITLE: "اكتبي عنواناً للاجتماع.",
  UNREACHABLE: "التطبيق لا يرد الآن."
};

/** When, in Israel time, Latin digits — the same moment she sees in the app. */
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function when(iso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const day = DAYS[["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday!)];
  return `${day} ${p.day}.${p.month} · ${p.hour}:${p.minute}`;
}
const tomorrow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(Date.now() + 86_400_000));

/** Meetings with her in the app (W7): she sees them, gets a notification, and a reminder an hour before. */
export function PersonAppMeetings({ memberId, canEdit }: { memberId: number; canEdit: boolean }) {
  const [view, setView] = useState<View>({ state: "loading" });
  const [form, setForm] = useState({ date: tomorrow(), time: "18:00", duration: "30", kind: "video", link: "", place: "", title: "متابعة", note: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/people/${memberId}/app/meetings`, { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (!response || !body) return setView({ state: "error" });
    if (body.configured === false || [403, 404].includes(response.status)) return setView({ state: "off" });
    if (!response.ok) return setView({ state: "error" });
    setView({ state: "ready", meetings: body.meetings });
  }, [memberId]);
  useEffect(() => { void load(); }, [load]);
  if (view.state === "off") return null;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function create() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/people/${memberId}/app/meetings`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok) { setMessage({ ok: true, text: "حُدّد — وصلها إشعار وسيذكّرها التطبيق قبل ساعة." }); await load(); }
    else setMessage({ ok: false, text: ERROR_TEXT[body.error] ?? "لم يُحدّد — حاولي مرة أخرى." });
  }

  async function cancel(id: string) {
    if (!window.confirm("إلغاء الاجتماع؟ يصلها إشعار بالإلغاء.")) return;
    const response = await fetch(`/api/people/${memberId}/app/meetings/${id}/cancel`, { method: "POST" }).catch(() => null);
    if (response?.ok) await load();
    else setMessage({ ok: false, text: "لم يُلغَ — حاولي مرة أخرى." });
  }

  const now = Date.now();
  return (
    <section className="crmCard" data-tone="forest">
      <header>
        <span className="crmDot" />
        <h2>اجتماعات بالتطبيق</h2>
      </header>
      {view.state === "loading" && <p className="crmEmpty">جارٍ التحميل…</p>}
      {view.state === "error" && <p className="crmEmpty">التطبيق لا يرد الآن.</p>}
      {view.state === "ready" && (
        <>
          {view.meetings.length === 0 ? <p className="crmEmpty">لا اجتماعات بعد.</p> : view.meetings.map((m) => {
            const over = Date.parse(m.starts_at) + m.duration_min * 60_000 < now;
            return (
              <div className="crmRow" key={m.id}>
                <span className="grow">
                  <span className="crmRowTitle" style={{ display: "block" }}>{m.title}</span>
                  <span className="crmRowDetail" style={{ display: "block" }}>
                    {when(m.starts_at)} · {KIND[m.kind]} · {m.duration_min} د{m.place ? ` · ${m.place}` : ""}
                  </span>
                </span>
                {m.status === "cancelled" ? <span className="crmPill">أُلغي</span>
                  : over ? <span className="crmPill">انتهى</span>
                  : canEdit ? <button className="crmBtn quiet" onClick={() => void cancel(m.id)} type="button">إلغاء</button>
                  : <span className="crmPill live">قادم</span>}
              </div>
            );
          })}
          {canEdit && (
            <div className="crmPad" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <label className="crmField"><span>التاريخ</span><input onChange={set("date")} type="date" value={form.date} /></label>
                <label className="crmField"><span>الساعة (توقيت البلاد)</span><input onChange={set("time")} type="time" value={form.time} /></label>
                <label className="crmField" style={{ width: 100 }}><span>المدة (د)</span><input inputMode="numeric" onChange={set("duration")} value={form.duration} /></label>
                <label className="crmField"><span>النوع</span>
                  <select onChange={set("kind")} value={form.kind}>
                    <option value="video">فيديو</option><option value="phone">مكالمة</option><option value="in_person">وجهاً لوجه</option>
                  </select>
                </label>
              </div>
              <label className="crmField"><span>العنوان</span><input maxLength={80} onChange={set("title")} value={form.title} /></label>
              {form.kind === "video" && <label className="crmField"><span>رابط الاجتماع (zoom / meet)</span><input dir="ltr" onChange={set("link")} placeholder="https://" value={form.link} /></label>}
              {form.kind === "in_person" && <label className="crmField"><span>المكان</span><input maxLength={200} onChange={set("place")} value={form.place} /></label>}
              <label className="crmField"><span>ملاحظة لها (اختياري)</span><input maxLength={500} onChange={set("note")} value={form.note} /></label>
              <button className="crmBtn primary" disabled={busy} onClick={() => void create()} type="button">{busy ? "لحظة…" : "حدّدي الاجتماع"}</button>
            </div>
          )}
          {message && <p className="crmEmpty">{message.text}</p>}
        </>
      )}
    </section>
  );
}
