"use client";

import { useState } from "react";

type Answer = {
  id: number;
  label: string;
  value: string;
  kind: string;
  options: string[];
  mapsTo: string;
};

const MAPPED: Record<string, string> = {
  name: "الاسم",
  phone: "الهاتف",
  city: "البلدة"
};

/**
 * Correcting what somebody already sent.
 *
 * Only the answers are edited. The registration's name, phone and town are
 * derived from them on the server — editing the phone answer rewrites the
 * phone the approval will use — so they are shown here as a reading of the
 * current state rather than as three more boxes to disagree with.
 */
export function SubmissionEditor({
  answers,
  canEdit,
  name,
  phone,
  city,
  submissionId
}: {
  answers: Answer[];
  canEdit: boolean;
  name: string;
  phone: string;
  city: string;
  submissionId: number;
}) {
  const [draft, setDraft] = useState<Record<number, string>>(
    Object.fromEntries(answers.map((answer) => [answer.id, answer.value]))
  );
  const [saved, setSaved] = useState<Record<number, string>>(
    Object.fromEntries(answers.map((answer) => [answer.id, answer.value]))
  );
  const [derived, setDerived] = useState({ name, phone, city });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const edits = answers
    .filter((answer) => draft[answer.id] !== saved[answer.id])
    .map((answer) => ({ answerId: answer.id, value: draft[answer.id] }));

  async function save() {
    setBusy(true);
    setError("");
    setNote("");

    const response = await fetch(`/api/forms/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "تعذّر حفظ التعديل.");
      return;
    }

    setSaved({ ...saved, ...Object.fromEntries(edits.map((edit) => [edit.answerId, edit.value])) });
    if (payload.submission) {
      setDerived({
        name: payload.submission.name,
        phone: payload.submission.phone,
        city: payload.submission.city
      });
    }
    setNote(
      payload.phoneWarning ||
        `حُفظ${payload.changed?.length ? ` · ${payload.changed.length} إجابة` : ""}.`
    );
  }

  return (
    <>
      <section className="crmCard crmPad" data-tone="olive">
        <div className="crmStats">
          {(["name", "phone", "city"] as const).map((key) => (
            <div className="crmStat" data-tone="olive" key={key}>
              <span className="statFigure" style={{ fontSize: 15 }}>
                <bdi>{derived[key] || "—"}</bdi>
              </span>
              <span className="statName">{MAPPED[key]}</span>
            </div>
          ))}
        </div>
        <p className="crmNote">
          هذه الثلاثة تُقرأ من الإجابات نفسها، لا تُكتب هنا. تعديل إجابة الهاتف يغيّر الرقم الذي
          سيستعمله «أضف للمجموعة».
        </p>
      </section>

      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>الإجابات</h2>
          {edits.length > 0 && <span className="crmPill alert">{edits.length} غير محفوظ</span>}
        </header>

        <div className="crmPad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {answers.map((answer) => {
            const changed = draft[answer.id] !== saved[answer.id];
            return (
              <label className="crmField" key={answer.id}>
                <span>
                  {answer.label}
                  {answer.mapsTo ? ` · ${MAPPED[answer.mapsTo] ?? answer.mapsTo}` : ""}
                  {changed ? " ✎" : ""}
                </span>

                {answer.kind === "choice" && answer.options.length > 0 ? (
                  <select
                    disabled={!canEdit || busy}
                    onChange={(event) => setDraft({ ...draft, [answer.id]: event.target.value })}
                    value={draft[answer.id]}
                  >
                    {/* The answer on file may not be among today's options
                        if the question was edited after she replied; it is
                        kept rather than silently swapped for the first one. */}
                    {!answer.options.includes(draft[answer.id]) && (
                      <option value={draft[answer.id]}>{draft[answer.id] || "—"}</option>
                    )}
                    {answer.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : answer.kind === "textarea" || answer.value.length > 60 ? (
                  <textarea
                    disabled={!canEdit || busy}
                    onChange={(event) => setDraft({ ...draft, [answer.id]: event.target.value })}
                    rows={3}
                    value={draft[answer.id]}
                  />
                ) : answer.kind === "signature" ? (
                  <span className="crmRowDetail">توقيع — لا يُعدّل من هنا.</span>
                ) : (
                  <input
                    disabled={!canEdit || busy}
                    onChange={(event) => setDraft({ ...draft, [answer.id]: event.target.value })}
                    style={answer.mapsTo === "phone" ? { direction: "ltr", textAlign: "right" } : undefined}
                    type="text"
                    value={draft[answer.id]}
                  />
                )}
              </label>
            );
          })}
        </div>

        <div className="crmPager">
          <span className="crmRowDetail">
            {canEdit ? "كل تعديل يُسجَّل باسم من أجراه." : "لا تملك صلاحية «إدارة الاستمارات»."}
          </span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {error && <span className="crmError">{error}</span>}
            {!error && note && <span className="crmRowDetail">{note}</span>}
            <button
              className="crmBtn primary"
              disabled={!canEdit || busy || edits.length === 0}
              onClick={save}
              type="button"
            >
              {busy ? "…" : "حفظ"}
            </button>
          </span>
        </div>
      </section>
    </>
  );
}
