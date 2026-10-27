"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const NAME_TOKEN = "{{name}}";

type Step = {
  id: number;
  week: number;
  weekday: number;
  sendTime: string;
  label: string;
  freeText: string;
  templateName: string;
  templateLanguage: string;
  templatePreview: string;
  smsText: string;
  smsUsesFreeText: boolean;
};

type Template = { name: string; language: string; status: string; bodyText: string; paramCount: number };

const BLANK = {
  week: 1,
  weekday: 0,
  sendTime: "07:00",
  label: "",
  freeText: "",
  templateName: "",
  smsText: "",
  smsUsesFreeText: false
};

/**
 * The flow itself: which message goes out on which day, written once.
 *
 * A step is a template plus an hour. The template is the part Meta has
 * approved, so it is picked rather than typed — and the free text is what
 * goes out instead when her 24-hour window happens to be open.
 */
export function PathSteps({
  canEdit,
  pathId,
  steps,
  templates
}: {
  canEdit: boolean;
  pathId: number;
  steps: Step[];
  templates: Template[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({ ...BLANK });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const approved = templates.filter((item) => item.status === "APPROVED");
  const picked = approved.find((item) => item.name === draft.templateName) ?? null;

  function edit(step: Step) {
    setEditingId(step.id);
    setOpen(true);
    setDraft({
      week: step.week,
      weekday: step.weekday,
      sendTime: step.sendTime,
      label: step.label,
      freeText: step.freeText,
      templateName: step.templateName,
      smsText: step.smsText,
      smsUsesFreeText: step.smsUsesFreeText
    });
  }

  function reset() {
    setEditingId(null);
    setOpen(false);
    setDraft({ ...BLANK });
    setError("");
  }

  async function save() {
    if (!picked) {
      setError("اختاري قالب معتمد لهاي الخطوة.");
      return;
    }
    setBusy(true);
    setError("");

    // The approved body and its parameter count come from Meta, not from
    // this form: a step that disagrees with its template is refused at
    // send time with «Parameter format does not match».
    const payload = {
      ...draft,
      templateLanguage: picked.language,
      templatePreview: picked.bodyText,
      bodyParams: Array.from({ length: picked.paramCount }, (_, at) => (at === 0 ? NAME_TOKEN : ""))
    };

    const response = await fetch(
      editingId ? `/api/journeys/steps/${editingId}` : `/api/journeys/templates/${pathId}/steps`,
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
    setBusy(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "ما زبطت.");
      return;
    }
    reset();
    router.refresh();
  }

  async function remove(step: Step) {
    if (!window.confirm(`تمسحي «${step.label || WEEKDAYS[step.weekday]}»؟`)) {
      return;
    }
    setBusy(true);
    await fetch(`/api/journeys/steps/${step.id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>الخطوات</h2>
          <span className="crmPill tone spacer">{steps.length}</span>
        </header>

        {steps.length === 0 ? (
          <p className="crmEmpty">ولا خطوة لهلق.</p>
        ) : (
          steps.map((step) => (
            <div className="crmRow" key={step.id}>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {step.label || `أسبوع ${step.week}`}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  أسبوع {step.week} · {WEEKDAYS[step.weekday]} {step.sendTime} · {step.templateName || "بلا قالب"}
                  {step.freeText ? " · فيها نص حر" : ""}
                </span>
              </span>
              {canEdit ? (
                <span style={{ display: "flex", gap: 6 }}>
                  <button className="crmBtn" disabled={busy} onClick={() => edit(step)} type="button">
                    تعديل
                  </button>
                  <button className="crmBtn danger" disabled={busy} onClick={() => void remove(step)} type="button">
                    مسح
                  </button>
                </span>
              ) : null}
            </div>
          ))
        )}

        {canEdit && !open ? (
          <div className="crmPad">
            <button className="crmBtn primary" onClick={() => setOpen(true)} type="button">
              أضيفي خطوة
            </button>
          </div>
        ) : null}
      </section>

      {canEdit && open ? (
        <section className="crmCard" data-tone="clay">
          <header>
            <span className="crmDot" />
            <h2>{editingId ? "تعديل خطوة" : "خطوة جديدة"}</h2>
          </header>
          <div className="crmPad" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <label>
                الأسبوع
                <input
                  min={1}
                  onChange={(event) => setDraft({ ...draft, week: Math.max(1, Number(event.target.value) || 1) })}
                  style={{ display: "block", width: 90, marginTop: 4 }}
                  type="number"
                  value={draft.week}
                />
              </label>
              <label>
                اليوم
                <select
                  onChange={(event) => setDraft({ ...draft, weekday: Number(event.target.value) })}
                  style={{ display: "block", marginTop: 4 }}
                  value={draft.weekday}
                >
                  {WEEKDAYS.map((name, at) => (
                    <option key={name} value={at}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                الساعة
                <input
                  onChange={(event) => setDraft({ ...draft, sendTime: event.target.value })}
                  style={{ display: "block", marginTop: 4 }}
                  type="time"
                  value={draft.sendTime}
                />
              </label>
            </div>

            <label>
              اسم الخطوة (اختياري)
              <input
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                style={{ display: "block", width: "100%", marginTop: 4 }}
                value={draft.label}
              />
            </label>

            <label>
              القالب المعتمد
              <select
                onChange={(event) => setDraft({ ...draft, templateName: event.target.value })}
                style={{ display: "block", width: "100%", marginTop: 4 }}
                value={draft.templateName}
              >
                <option value="">اختاري…</option>
                {approved.map((item) => (
                  <option key={`${item.name}:${item.language}`} value={item.name}>
                    {item.name} · {item.language}
                  </option>
                ))}
              </select>
            </label>

            {picked ? (
              <pre className="crmNote" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {picked.bodyText}
              </pre>
            ) : null}

            <label>
              النص الحر (بينبعت بدل القالب لما تكون نافذتها مفتوحة)
              <textarea
                onChange={(event) => setDraft({ ...draft, freeText: event.target.value })}
                rows={4}
                style={{ display: "block", width: "100%", marginTop: 4 }}
                value={draft.freeText}
              />
            </label>

            {error ? <p className="crmError">{error}</p> : null}

            <div style={{ display: "flex", gap: 8 }}>
              <button className="crmBtn primary" disabled={busy || !picked} onClick={() => void save()} type="button">
                {busy ? "…" : editingId ? "احفظي" : "أضيفي"}
              </button>
              <button className="crmBtn" onClick={reset} type="button">
                إلغاء
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
