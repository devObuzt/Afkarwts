"use client";

import { useState } from "react";
import type { JourneyFunnel, Outcome, StepRow } from "@/app/lib/journeys/report";

type WhoRow = { memberId: number; name: string; phone: string; detail: string };

const OUTCOMES: Array<[Outcome, string]> = [
  ["never_sent", "ما بعتنا إلها ولا رسالة"],
  ["not_delivered", "بعتنا وما وصلها"],
  ["delivered_unread", "وصلها وما انقرأ"],
  ["read_silent", "قرأت وما ردّت"],
  ["replied", "ردّت"]
];

const BUCKET_LABEL: Record<string, string> = {
  sent: "انبعتلهن",
  not_sent: "ما انبعتلها ولا سطر",
  delivered: "وصلتهن",
  undelivered: "بعتنا وما وصلها",
  read: "قرأنها",
  replied: "ردّوا",
  failed: "فشلت",
  missed: "فات وقتها",
  deferred: "مؤجّلة",
  skipped: "انشالت",
  stuck: "عالقة",
  sms_sent: "لحقهن SMS",
  sms_failed: "الـSMS كمان فشل",
  sms_queued: "SMS بالطابور",
  none_reached: "ولا وصلها إشي — لا واتساب ولا SMS",
  enrolled: "المشتركات"
};

/**
 * What went wrong on one step. Every one of them opens into names — a
 * step the window shut on is a woman who did not get it, not a timing.
 */
function Problems({ onOpen, step }: { onOpen: (bucket: string) => void; step: StepRow }) {
  const parts = (
    [
      ["failed", step.failed],
      ["missed", step.missed],
      ["skipped", step.skipped],
      ["deferred", step.deferred],
      ["stuck", step.stuck]
    ] as Array<[string, number]>
  ).filter(([, n]) => n > 0);

  if (!parts.length) {
    return <>—</>;
  }

  return (
    <>
      {parts.map(([bucket, n], at) => (
        <span key={bucket}>
          {at ? " · " : ""}
          <Stat n={n} onOpen={() => onOpen(bucket)} />
          <span className="crmRowDetail"> {BUCKET_LABEL[bucket]}</span>
        </span>
      ))}
    </>
  );
}

/** A number you can press, or a zero you cannot. */
function Stat({ n, onOpen }: { n: number; onOpen: () => void }) {
  if (!n) {
    return <>0</>;
  }
  return (
    <button className="crmLink" onClick={onOpen} type="button">
      {n}
    </button>
  );
}

/**
 * The report, with every number openable.
 *
 * A number nobody can press is a number nobody can act on: the day this
 * screen said «249 sent · 248 delivered», finding the one woman in the
 * gap meant reading the database by hand. Each bucket here is defined by
 * the same condition that counted it, so the list and the number can
 * never disagree.
 */
export function Report({
  funnel,
  journeyId,
  steps
}: {
  funnel: JourneyFunnel;
  journeyId: number;
  steps: StepRow[];
}) {
  const [who, setWho] = useState<{ bucket: string; rows: WhoRow[]; loading: boolean } | null>(null);

  async function open(bucket: string, stepId: number | null) {
    setWho({ bucket, rows: [], loading: true });
    const step = stepId === null ? "" : `&step=${stepId}`;
    try {
      const response = await fetch(`/api/journeys/${journeyId}/who?bucket=${encodeURIComponent(bucket)}${step}`);
      const payload = await response.json();
      setWho({ bucket, rows: payload.rows ?? [], loading: false });
    } catch {
      setWho({ bucket, rows: [], loading: false });
    }
  }

  const outcomes = funnel.outcomes;

  return (
    <>
      {/*
        Where every woman stands, one label each, adding up to the cohort.
        The funnel overlaps, so no row of it is «the people with a
        problem» — which is how 54 of 252 went unnoticed for two days.
      */}
      <section className="crmCard" data-tone="olive">
        <header>
          <span className="crmDot" />
          <h2>وين كل وحدة</h2>
          <span className="crmPill tone spacer">{funnel.enrolled}</span>
        </header>
        <div className="crmPad" style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {OUTCOMES.map(([key, label]) => (
            <div key={key} style={{ minWidth: 150 }}>
              <strong style={{ fontSize: 20 }}>
                <Stat n={outcomes[key] ?? 0} onOpen={() => void open(`outcome:${key}`, null)} />
              </strong>
              <span className="crmRowDetail" style={{ display: "block" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </section>

      {who ? (
        <section className="crmCard" data-tone="clay">
          <header>
            <span className="crmDot" />
            <h2>{BUCKET_LABEL[who.bucket.replace("outcome:", "")] ?? who.bucket}</h2>
            <span className="crmPill tone spacer">{who.rows.length}</span>
            <button className="crmBtn" onClick={() => setWho(null)} style={{ marginInlineStart: "auto" }} type="button">
              إغلاق
            </button>
          </header>
          {who.loading ? (
            <p className="crmEmpty">بنحمّل…</p>
          ) : who.rows.length ? (
            <ol className="crmPad" style={{ margin: 0, paddingInlineStart: 30 }}>
              {who.rows.map((row) => (
                <li key={row.memberId} style={{ marginBottom: 4 }}>
                  <a href={`/new/people/${row.memberId}`}>{row.name.trim() || row.phone}</a>
                  <span className="crmRowDetail"> · {row.phone}</span>
                  {row.detail ? <span className="crmRowDetail"> · {row.detail}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="crmEmpty">ولا وحدة.</p>
          )}
        </section>
      ) : null}

      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>الخطوات</h2>
          <span className="crmPill tone spacer">{steps.length}</span>
        </header>
        <div style={{ overflowX: "auto" }}>
          <table className="crmTable">
            <thead>
              <tr>
                <th>الخطوة</th>
                <th>موعدها</th>
                <th>انبعتت</th>
                <th>ما انبعتلها</th>
                <th>وصلت</th>
                <th>ما وصلها</th>
                <th>انقرأت</th>
                <th>ردّوا</th>
                <th>SMS</th>
                <th>ولا وصلها إشي</th>
                <th>مشاكل</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => (
                <tr key={step.stepId}>
                  <td>{step.label}</td>
                  <td>
                    {new Date(step.dueAt).toLocaleString("en-GB", {
                      timeZone: "Asia/Jerusalem",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false
                    })}
                  </td>
                  <td>
                    <Stat n={step.sentText + step.sentTemplate} onOpen={() => void open("sent", step.stepId)} />
                    {step.sentText ? <span className="crmRowDetail"> ({step.sentText} نص حر)</span> : null}
                  </td>
                  <td>
                    <Stat n={step.notSent} onOpen={() => void open("not_sent", step.stepId)} />
                  </td>
                  <td>
                    <Stat n={step.delivered} onOpen={() => void open("delivered", step.stepId)} />
                  </td>
                  <td>
                    <Stat n={step.undelivered} onOpen={() => void open("undelivered", step.stepId)} />
                  </td>
                  <td>
                    <Stat n={step.read} onOpen={() => void open("read", step.stepId)} />
                  </td>
                  <td>
                    <Stat n={step.replied} onOpen={() => void open("replied", step.stepId)} />
                  </td>
                  <td>
                    {step.smsSent || step.smsFailed || step.smsQueued ? (
                      <>
                        <Stat n={step.smsSent} onOpen={() => void open("sms_sent", step.stepId)} />
                        {step.smsFailed ? (
                          <>
                            {" · "}
                            <Stat n={step.smsFailed} onOpen={() => void open("sms_failed", step.stepId)} />
                            <span className="crmRowDetail"> فشل</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Stat n={step.noneReached} onOpen={() => void open("none_reached", step.stepId)} />
                  </td>
                  <td>
                    <Problems onOpen={(bucket) => void open(bucket, step.stepId)} step={step} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
