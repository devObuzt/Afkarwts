"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { choices, registrations } from "../../../format";

type Field = {
  id: number;
  label: string;
  help: string;
  kind: string;
  required: boolean;
  options: string[];
  mapsTo: string;
  showWhenFieldId: number | null;
  showWhenValue: string;
};

const KINDS: Array<{ value: string; label: string; detail: string }> = [
  { value: "text", label: "إجابة قصيرة", detail: "سطر واحد: اسم، رقم هوية." },
  { value: "textarea", label: "إجابة طويلة", detail: "عدة أسطر: العنوان، وصف الحالة." },
  { value: "phone", label: "هاتف", detail: "لوحة أرقام على الجوال." },
  { value: "date", label: "تاريخ", detail: "تاريخ الميلاد مثلاً." },
  { value: "choice", label: "اختيار واحد", detail: "قائمة، تُختار منها إجابة." },
  { value: "multi", label: "اختيار عدة", detail: "مربعات، تُختار منها أكثر من واحدة." },
  { value: "consent", label: "إقرار", detail: "نص طويل يُوافَق عليه." },
  { value: "town", label: "بلدة", detail: "قائمة البلدات، بحث بالكتابة." },
  { value: "signature", label: "توقيع", detail: "تُرسم بالإصبع." }
];

const MAPS: Array<{ value: string; label: string }> = [
  { value: "", label: "لا شيء" },
  { value: "name", label: "الاسم" },
  { value: "phone", label: "الهاتف" },
  { value: "city", label: "البلدة" }
];

const EMPTY = {
  label: "",
  help: "",
  kind: "text",
  required: true,
  options: "",
  mapsTo: "",
  showWhenFieldId: "",
  showWhenValue: ""
};

/**
 * The questions, as Afkar reads them.
 *
 * Reordering, adding and deleting go straight to the server — there is no
 * «save the whole form» button, because a half-saved form that somebody is
 * filling in at that moment is worse than one change at a time.
 */
export function FormEditor({
  canEdit,
  fields,
  form,
  submissions
}: {
  canEdit: boolean;
  fields: Field[];
  form: { id: number; name: string; intro: string; status: string; token: string };
  submissions: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [head, setHead] = useState({ name: form.name, intro: form.intro });

  async function call(path: string, init: RequestInit, done: string) {
    setBusy(true);
    setError("");
    setNote("");
    const response = await fetch(path, {
      ...init,
      headers: init.body ? { "Content-Type": "application/json" } : undefined
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "تعذّرت العملية.");
      return false;
    }
    setNote(done);
    router.refresh();
    return true;
  }

  function startEdit(field: Field) {
    setAdding(false);
    setEditing(field.id);
    setDraft({
      label: field.label,
      help: field.help,
      kind: field.kind,
      required: field.required,
      options: field.options.join("\n"),
      mapsTo: field.mapsTo,
      showWhenFieldId: field.showWhenFieldId ? String(field.showWhenFieldId) : "",
      showWhenValue: field.showWhenValue
    });
  }

  function payload() {
    return {
      label: draft.label.trim(),
      help: draft.help.trim(),
      kind: draft.kind,
      required: draft.required,
      options: draft.options
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      mapsTo: draft.mapsTo,
      showWhenFieldId: draft.showWhenFieldId ? Number(draft.showWhenFieldId) : null,
      showWhenValue: draft.showWhenValue
    };
  }

  const needsOptions = draft.kind === "choice" || draft.kind === "multi";
  const gate = fields.find((field) => String(field.id) === draft.showWhenFieldId);

  return (
    <>
      {/* The link itself: what is actually sent. */}
      <section className="crmCard crmPad" data-tone="olive">
        <div className="crmStats">
          <div className="crmStat" data-tone={form.status === "open" ? "olive" : "clay"}>
            <span className="statFigure" style={{ fontSize: 15 }}>
              {form.status === "open" ? "مفتوحة" : "مغلقة"}
            </span>
            <span className="statName">حالة الاستمارة</span>
          </div>
          <div className="crmStat" data-tone="forest">
            <span className="statFigure" style={{ fontSize: 15 }}>
              {submissions}
            </span>
            <span className="statName">{registrations(submissions)}</span>
          </div>
        </div>

        <label className="crmField">
          <span>الرابط الذي يُرسل</span>
          <input onFocus={(event) => event.target.select()} readOnly type="text" value={`/f/${form.token}`} />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <a className="crmBtn quiet" href={`/f/${form.token}`} rel="noreferrer" target="_blank">
            فتح الاستمارة كما تراها المنتسبة
          </a>
          <button
            className="crmBtn quiet"
            disabled={!canEdit || busy}
            onClick={() =>
              call(
                `/api/forms/${form.id}`,
                { method: "PATCH", body: JSON.stringify({ status: form.status === "open" ? "closed" : "open" }) },
                form.status === "open" ? "أُغلقت الاستمارة." : "فُتحت الاستمارة."
              )
            }
            type="button"
          >
            {form.status === "open" ? "إغلاق التسجيل" : "فتح التسجيل"}
          </button>
        </div>
      </section>

      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>اسم الاستمارة ومقدّمتها</h2>
        </header>
        <div className="crmPad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="crmField">
            <span>الاسم — داخلي، لا تراه المنتسبة</span>
            <input
              disabled={!canEdit || busy}
              onChange={(event) => setHead({ ...head, name: event.target.value })}
              type="text"
              value={head.name}
            />
          </label>
          <label className="crmField">
            <span>المقدّمة — أول ما تقرأه المنتسبة</span>
            <textarea
              disabled={!canEdit || busy}
              onChange={(event) => setHead({ ...head, intro: event.target.value })}
              rows={3}
              value={head.intro}
            />
          </label>
          <span>
            <button
              className="crmBtn primary"
              disabled={!canEdit || busy || (head.name === form.name && head.intro === form.intro)}
              onClick={() =>
                call(`/api/forms/${form.id}`, { method: "PATCH", body: JSON.stringify(head) }, "حُفظ.")
              }
              type="button"
            >
              حفظ
            </button>
          </span>
        </div>
      </section>

      <section className="crmCard" data-tone="forest">
        <header>
          <span className="crmDot" />
          <h2>الأسئلة</h2>
          <button
            className="crmBtn primary spacer"
            disabled={!canEdit || busy}
            onClick={() => {
              setEditing(null);
              setAdding(true);
              setDraft(EMPTY);
            }}
            type="button"
          >
            + سؤال
          </button>
        </header>

        {submissions > 0 && (
          <div className="crmPad" style={{ paddingBottom: 0 }}>
            <p className="crmNote">
              وصل {registrations(submissions)} على هذه الاستمارة. تعديل سؤال لا يغيّر ما أجابته من سجّلت
              قبله — إجاباتها محفوظة بنصّ السؤال كما كان ساعتها.
            </p>
          </div>
        )}

        {fields.length === 0 ? (
          <p className="crmEmpty">لا أسئلة بعد.</p>
        ) : (
          fields.map((field, index) => (
            <div className="crmRow" key={field.id}>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {index + 1}. {field.label}
                  {field.required ? " *" : ""}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  {KINDS.find((kind) => kind.value === field.kind)?.label ?? field.kind}
                  {field.mapsTo ? ` · يملأ ${MAPS.find((m) => m.value === field.mapsTo)?.label}` : ""}
                  {field.options.length ? ` · ${choices(field.options.length)}` : ""}
                  {field.showWhenFieldId
                    ? ` · يظهر إذا كان «${
                        fields.find((item) => item.id === field.showWhenFieldId)?.label.slice(0, 20) ?? "؟"
                      }» = ${field.showWhenValue}`
                    : ""}
                </span>
              </span>

              <button
                className="crmBtn quiet"
                disabled={!canEdit || busy || index === 0}
                onClick={() =>
                  call(`/api/forms/fields/${field.id}`, { method: "PATCH", body: JSON.stringify({ move: "up" }) }, "نُقل.")
                }
                title="أعلى"
                type="button"
              >
                ↑
              </button>
              <button
                className="crmBtn quiet"
                disabled={!canEdit || busy || index === fields.length - 1}
                onClick={() =>
                  call(
                    `/api/forms/fields/${field.id}`,
                    { method: "PATCH", body: JSON.stringify({ move: "down" }) },
                    "نُقل."
                  )
                }
                title="أسفل"
                type="button"
              >
                ↓
              </button>
              <button className="crmBtn quiet" disabled={!canEdit || busy} onClick={() => startEdit(field)} type="button">
                تعديل
              </button>
              <button
                className="crmBtn danger"
                disabled={!canEdit || busy}
                onClick={() => {
                  if (!confirm(`حذف السؤال «${field.label}»؟ الإجابات التي وصلت عليه تبقى محفوظة.`)) {
                    return;
                  }
                  void call(`/api/forms/fields/${field.id}`, { method: "DELETE" }, "حُذف السؤال.");
                }}
                type="button"
              >
                حذف
              </button>
            </div>
          ))
        )}

        {(adding || editing !== null) && (
          <div className="crmPad" style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 12 }}>
            <strong>{adding ? "سؤال جديد" : "تعديل السؤال"}</strong>

            <label className="crmField">
              <span>نصّ السؤال</span>
              <input
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                type="text"
                value={draft.label}
              />
            </label>

            <label className="crmField">
              <span>توضيح تحته (اختياري)</span>
              <input
                onChange={(event) => setDraft({ ...draft, help: event.target.value })}
                type="text"
                value={draft.help}
              />
            </label>

            <label className="crmField">
              <span>نوع الإجابة</span>
              <select onChange={(event) => setDraft({ ...draft, kind: event.target.value })} value={draft.kind}>
                {KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label} — {kind.detail}
                  </option>
                ))}
              </select>
            </label>

            {needsOptions && (
              <label className="crmField">
                <span>الخيارات — واحد في كل سطر</span>
                <textarea
                  onChange={(event) => setDraft({ ...draft, options: event.target.value })}
                  rows={4}
                  value={draft.options}
                />
              </label>
            )}

            <label className="crmField">
              <span>يملأ في ملف المنتسبة</span>
              <select onChange={(event) => setDraft({ ...draft, mapsTo: event.target.value })} value={draft.mapsTo}>
                {MAPS.map((map) => (
                  <option key={map.value} value={map.value}>
                    {map.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="crmField">
              <span>يظهر فقط إذا أُجيب سؤال آخر بإجابة معيّنة</span>
              <select
                onChange={(event) => setDraft({ ...draft, showWhenFieldId: event.target.value, showWhenValue: "" })}
                value={draft.showWhenFieldId}
              >
                <option value="">يظهر دائماً</option>
                {fields
                  .filter((field) => field.id !== editing && field.options.length > 0)
                  .map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.label.slice(0, 40)}
                    </option>
                  ))}
              </select>
            </label>

            {gate && (
              <label className="crmField">
                <span>عند الإجابة</span>
                <select
                  onChange={(event) => setDraft({ ...draft, showWhenValue: event.target.value })}
                  value={draft.showWhenValue}
                >
                  <option value="">—</option>
                  {gate.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                checked={draft.required}
                onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
                type="checkbox"
              />
              <span>إجابته إلزامية</span>
            </label>

            <span style={{ display: "flex", gap: 8 }}>
              <button
                className="crmBtn primary"
                disabled={busy || !draft.label.trim() || (needsOptions && !draft.options.trim())}
                onClick={async () => {
                  const ok = adding
                    ? await call(
                        `/api/forms/${form.id}/fields`,
                        { method: "POST", body: JSON.stringify(payload()) },
                        "أُضيف السؤال."
                      )
                    : await call(
                        `/api/forms/fields/${editing}`,
                        { method: "PATCH", body: JSON.stringify(payload()) },
                        "حُفظ السؤال."
                      );
                  if (ok) {
                    setAdding(false);
                    setEditing(null);
                    setDraft(EMPTY);
                  }
                }}
                type="button"
              >
                {adding ? "إضافة" : "حفظ"}
              </button>
              <button
                className="crmBtn quiet"
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                  setDraft(EMPTY);
                }}
                type="button"
              >
                إلغاء
              </button>
            </span>
          </div>
        )}

        <div className="crmPager">
          <span className="crmRowDetail">
            {canEdit ? "كل تغيير يُحفظ وحده فور الضغط." : "لا تملك صلاحية «إدارة الاستمارات»."}
          </span>
          <span>
            {error && <span className="crmError">{error}</span>}
            {!error && note && <span className="crmRowDetail">{note}</span>}
          </span>
        </div>
      </section>

      {/* Deleting a form takes its registrations with it, so it sits at the
          very bottom, behind a confirmation that names the number. Closing
          the form is the thing that is almost always meant instead, and it
          is up at the top where it is reached first. */}
      {canEdit && (
        <section className="crmCard" data-tone="clay">
          <header>
            <span className="crmDot" />
            <h2>حذف الاستمارة</h2>
          </header>
          <div className="crmPad">
            <p className="crmRowDetail" style={{ marginTop: 0 }}>
              {/* «بيروح معها لا تسجيلات» ما بتنقرا — الصفر بدّه جملته. */}
              {submissions === 0
                ? "ما إلها ولا تسجيل، فما في شي بيروح معها."
                : `بيروح معها ${registrations(submissions)}. المنتسبات اللي انضافوا للمجموعة بيضلّوا.`}{" "}
              إذا بس بدّك توقّفي التسجيل، استعملي «إغلاق التسجيل» فوق.
            </p>
            <button
              className="crmBtn"
              disabled={busy}
              onClick={async () => {
                if (
                  !window.confirm(
                    submissions === 0
                      ? `تنحذف «${form.name}»؟ ما في رجعة.`
                      : `تنحذف «${form.name}»؟ بيروح معها ${registrations(submissions)}، وما في رجعة.`
                  )
                ) {
                  return;
                }
                if (await call(`/api/forms/${form.id}`, { method: "DELETE" }, "انحذفت.")) {
                  router.push("/new/library");
                }
              }}
              type="button"
            >
              احذفي الاستمارة
            </button>
          </div>
        </section>
      )}
    </>
  );
}
