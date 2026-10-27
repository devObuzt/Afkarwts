"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ago } from "../format";

type Row = {
  id: number;
  formId: number;
  formName: string;
  state: "new" | "added" | "rejected";
  name: string;
  phone: string;
  city: string;
  submittedAt: string;
  knownMemberId: number | null;
  knownMemberName: string | null;
};

type Answer = { label: string; value: string };

const STATE_PILL: Record<Row["state"], { label: string; className: string }> = {
  new: { label: "بانتظار المراجعة", className: "crmPill alert" },
  added: { label: "في المجموعة", className: "crmPill live" },
  rejected: { label: "مرفوضة", className: "crmPill" }
};

async function call(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? `ما زبطت (${response.status}).`);
  }
  return payload;
}

export function Registrations({
  canEditForms,
  rows,
  summary
}: {
  canEditForms: boolean;
  rows: Row[];
  summary: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const waiting = rows.filter((row) => row.state === "new");

  async function show(id: number) {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setError("");
    try {
      const response = await fetch(`/api/leads/${id}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "ما قدرنا نفتح التسجيل.");
      }
      setAnswers(payload.answers ?? []);
      setOpenId(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ما قدرنا نفتح التسجيل.");
    }
  }

  async function approve(ids: number[]) {
    const known = rows.filter((row) => ids.includes(row.id) && row.knownMemberId);
    let overwrite = false;

    // A returning participant already has a file here. Overwriting it with
    // whatever she typed this time is a choice, so it is asked once for the
    // whole batch rather than assumed.
    if (known.length) {
      overwrite = window.confirm(
        `${known.length} من هدول إلهن ملف عنا من قبل (${known
          .map((row) => row.knownMemberName)
          .join("، ")}).\n\n` +
          "موافقة — حدّثي الاسم والبلد من اللي كتبوه هلق.\n" +
          "إلغاء — خلّي بياناتهن زي ما هي. بالحالتين بينضافوا للمجموعة."
      );
    }

    setBusy(true);
    setError("");

    // One bad row used to abort the loop: the ones before it were added, the
    // ones after were never tried, and the screen named neither. Every row is
    // attempted, and the failures are reported together.
    const failed: number[] = [];
    const reasons: string[] = [];

    for (const id of ids) {
      try {
        await call(`/api/leads/${id}`, { action: "approve", overwrite });
      } catch (caught) {
        failed.push(id);
        const name = rows.find((row) => row.id === id)?.name || `#${id}`;
        reasons.push(`${name}: ${caught instanceof Error ? caught.message : "ما نجحت الإضافة."}`);
      }
    }

    // Only the ones that failed stay selected, so a second press retries
    // exactly those and nothing is added twice.
    setPicked(failed);
    setError(reasons.join(" · "));
    setBusy(false);
    router.refresh();
  }

  async function act(id: number, action: "reject" | "restore") {
    setBusy(true);
    setError("");
    try {
      await call(`/api/leads/${id}`, { action });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ما زبطت.");
    }
    setBusy(false);
  }

  return (
    <>
      {error ? <p className="crmError">{error}</p> : null}

      {picked.length > 0 && (
        <div className="crmCard crmPad leadBulk" data-tone="olive">
          <strong>{picked.length} مختارين</strong>
          <button className="crmBtn primary" disabled={busy} onClick={() => void approve(picked)} type="button">
            {busy ? "عم بنضيف…" : "أضيفيهن للمجموعة"}
          </button>
          <button className="crmBtn quiet" onClick={() => setPicked([])} type="button">
            إلغاء الاختيار
          </button>
        </div>
      )}

      <section className="crmCard" data-tone="clay">
        <header>
          <span className="crmDot" />
          <h2>{summary}</h2>
          {waiting.length > 1 && (
            <button
              className="crmBtn quiet spacer"
              onClick={() =>
                setPicked(picked.length === waiting.length ? [] : waiting.map((row) => row.id))
              }
              type="button"
            >
              {picked.length === waiting.length ? "ولا واحد" : "اختاري الكل"}
            </button>
          )}
        </header>

        {rows.length === 0 ? (
          <p className="crmEmpty">ما في تسجيلات هون.</p>
        ) : (
          rows.map((row) => (
            <div className="leadRow" key={row.id}>
              <div className="crmRow">
                {row.state === "new" && (
                  <input
                    aria-label={`اختاري ${row.name || row.phone}`}
                    className="leadPick"
                    checked={picked.includes(row.id)}
                    onChange={(event) =>
                      setPicked((current) =>
                        event.target.checked
                          ? [...current, row.id]
                          : current.filter((id) => id !== row.id)
                      )
                    }
                    type="checkbox"
                  />
                )}

                <button className="grow leadOpen" onClick={() => void show(row.id)} type="button">
                  <span className="crmRowTitle">
                    {row.name || "بلا اسم"}
                    {/* Only while she is still waiting: after approval she
                        *is* that member, so the badge would say nothing. */}
                    {row.state === "new" && row.knownMemberId ? (
                      <span className="crmPill warn">مسجّلة من قبل</span>
                    ) : null}
                  </span>
                  <span className="crmRowDetail">
                    <span className="crmLtr">{row.phone || "بلا رقم"}</span>
                    {row.city ? ` · ${row.city}` : ""} · {row.formName} · {ago(row.submittedAt)}
                  </span>
                </button>

                <span className={STATE_PILL[row.state].className}>{STATE_PILL[row.state].label}</span>

                {/* Before approval is the moment a typo is worth catching:
                    after it, the member exists with the wrong number. */}
                {canEditForms && row.state !== "added" && (
                  <Link className="crmBtn quiet" href={`/new/forms/${row.formId}/submissions/${row.id}`}>
                    تعديل
                  </Link>
                )}

                {row.state === "new" && (
                  <button
                    className="crmBtn primary"
                    disabled={busy}
                    onClick={() => void approve([row.id])}
                    type="button"
                  >
                    أضيفيها
                  </button>
                )}
                {row.state === "new" && (
                  <button className="crmBtn quiet" disabled={busy} onClick={() => void act(row.id, "reject")} type="button">
                    ارفضيها
                  </button>
                )}
                {row.state === "rejected" && (
                  <button className="crmBtn quiet" disabled={busy} onClick={() => void act(row.id, "restore")} type="button">
                    رجّعيها للمراجعة
                  </button>
                )}
              </div>

              {openId === row.id && (
                <dl className="crmAnswers">
                  {answers.length === 0 ? (
                    <p className="crmEmpty">ما في أجوبة محفوظة.</p>
                  ) : (
                    answers.map((answer, at) => (
                      <div key={at}>
                        <dt>{answer.label}</dt>
                        <dd>
                          {/* A signature is a PNG; printed as text it is seven
                              thousand characters of base64 where a name should be. */}
                          {answer.value.startsWith("data:image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={answer.label} className="leadSignature" src={answer.value} />
                          ) : (
                            answer.value || "—"
                          )}
                        </dd>
                      </div>
                    ))
                  )}
                </dl>
              )}
            </div>
          ))
        )}
      </section>
    </>
  );
}
