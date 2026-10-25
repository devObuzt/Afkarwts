"use client";

import { useCallback, useEffect, useState } from "react";

type CampaignInfo = {
  id: number;
  label: string;
  groupName: string;
  mode: "template" | "text";
  dailyLimit: number;
  status: "active" | "paused" | "done";
  lastRunAt: string | null;
  progress: { total: number; delivered: number; remaining: number; daysLeft: number };
};

type CampaignRun = { id: number; sent: number; failed: number; remaining: number; ranAt: string };
type RecipientRow = { memberId: number; name: string; phone: string; error: string | null; sentAt: string | null };
type FailureReason = { kind: string; title: string; explanation: string; action: string | null };
type FailedRow = RecipientRow & { reason: FailureReason; alternate: string | null; alternateTaken: boolean };
type CampaignDetail = { runs: CampaignRun[]; delivered: RecipientRow[]; failed: FailedRow[]; pending: RecipientRow[] };

const STATUS: Record<CampaignInfo["status"], string> = {
  active: "شغّالة",
  paused: "موقوفة",
  done: "خلصت"
};

/** Her name when she has one, her number when she does not. */
function shown(row: { name: string; phone: string }) {
  return row.name.trim() || row.phone;
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Jerusalem", hour12: false }) : "";
}

export function Campaigns({ canSend }: { canSend: boolean }) {
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/campaigns");
    if (response.ok) {
      setCampaigns((await response.json()).campaigns ?? []);
    }
    setLoading(false);
  }, []);

  // A batch lands while this is open; the page should show it without a reload.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(id: number, action: "pause" | "resume" | "run-now") {
    setBusy(true);
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    await load();
    setBusy(false);
  }

  // Sends made before campaigns were logged can be rebuilt from the messages.
  async function importPast() {
    setBusy(true);
    setNote("");
    const response = await fetch("/api/campaigns/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNote(payload.error ?? `ما زبطت (${response.status}).`);
    } else {
      const created = payload.created?.length ?? 0;
      setNote(created ? `انضافت ${created} إرسالة قديمة.` : "ولا إرسالة قديمة ناقصة.");
      await load();
    }
    setBusy(false);
  }

  if (loading) {
    return <p className="crmEmpty">بنحمّل…</p>;
  }

  return (
    <>
      <div className="crmCard crmPad" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="crmBtn" disabled={busy} onClick={() => void importPast()} type="button">
          استيراد الإرسالات القديمة
        </button>
        {note ? <span className="crmNote" style={{ margin: 0 }}>{note}</span> : null}
      </div>

      {!campaigns.length ? (
        <section className="crmCard crmPad">
          <p className="crmEmpty">
            ولا حملة لهلق. بتبلّش وحدة من «الإرسال الجماعي» ← حملة تلقائية: الدفعات بتطلع يومياً لحالها،
            وبيوصلك تقرير تلجرام بعد كل وحدة.
          </p>
        </section>
      ) : null}

      {campaigns.map((campaign) => {
        const percent = campaign.progress.total
          ? Math.round((campaign.progress.delivered / campaign.progress.total) * 100)
          : 0;
        return (
          <section className="crmCard" data-tone={campaign.status === "active" ? "sage" : undefined} key={campaign.id}>
            <header>
              <span className="crmDot" />
              <h2 dir="auto">{campaign.label}</h2>
              <span className="crmPill spacer">{STATUS[campaign.status]}</span>
            </header>

            <div className="crmPad">
              <div className="crmBar" title={`${percent}%`}>
                <span style={{ width: `${percent}%` }} />
              </div>
              <p className="crmNote" style={{ marginTop: 8 }}>
                {campaign.progress.delivered} من {campaign.progress.total} وصلتهن
                {campaign.progress.remaining > 0
                  ? ` · باقي ${campaign.progress.remaining} (~${campaign.progress.daysLeft} يوم)`
                  : ""}
                {" · "}
                {campaign.dailyLimit}/يوم
                {campaign.lastRunAt ? ` · آخر دفعة ${when(campaign.lastRunAt)}` : ""}
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button
                  className="crmBtn"
                  onClick={() => setOpenId(openId === campaign.id ? null : campaign.id)}
                  type="button"
                >
                  {openId === campaign.id ? "إخفاء الدفعات" : "الدفعات ومين ناقص"}
                </button>

                {canSend && campaign.status !== "done" ? (
                  campaign.status === "active" ? (
                    <>
                      <button className="crmBtn" disabled={busy} onClick={() => void act(campaign.id, "pause")} type="button">
                        وقّفها
                      </button>
                      <button className="crmBtn" disabled={busy} onClick={() => void act(campaign.id, "run-now")} type="button">
                        ابعت الدفعة الجاية هلق
                      </button>
                    </>
                  ) : (
                    <button className="crmBtn" disabled={busy} onClick={() => void act(campaign.id, "resume")} type="button">
                      كمّلها
                    </button>
                  )
                ) : null}
              </div>

              {openId === campaign.id ? <Detail campaignId={campaign.id} /> : null}
            </div>
          </section>
        );
      })}
    </>
  );
}

function Detail({ campaignId }: { campaignId: number }) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [tab, setTab] = useState<"runs" | "failed" | "pending">("runs");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/detail`);
      if (!response.ok || cancelled) {
        return;
      }
      setDetail(await response.json());
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (!detail) {
    return <p className="crmEmpty">بنحمّل الدفعات…</p>;
  }

  // Failures are grouped by reason, so twenty-seven identical lines become
  // one sentence you can act on.
  const groups = Object.values(
    detail.failed.reduce<Record<string, { reason: FailureReason; rows: FailedRow[] }>>((all, row) => {
      const key = row.reason.kind;
      all[key] = all[key] ?? { reason: row.reason, rows: [] };
      all[key].rows.push(row);
      return all;
    }, {})
  );

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {(
          [
            ["runs", "الدفعات", detail.runs.length],
            ["failed", "فشلوا", detail.failed.length],
            ["pending", "لسه ما انبعتلهن", detail.pending.length]
          ] as Array<[typeof tab, string, number]>
        ).map(([key, label, count]) => (
          <button
            className={tab === key ? "crmBtn current" : "crmBtn"}
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            {label} ({count})
          </button>
        ))}
      </div>

      {tab === "runs" ? (
        detail.runs.length ? (
          <table className="crmTable">
            <thead>
              <tr>
                <th>#</th>
                <th>وقتها</th>
                <th>انبعتت</th>
                <th>فشلت</th>
                <th>باقي</th>
              </tr>
            </thead>
            <tbody>
              {detail.runs.map((run, index) => (
                <tr key={run.id}>
                  <td>{detail.runs.length - index}</td>
                  <td>{when(run.ranAt)}</td>
                  <td>{run.sent}</td>
                  <td>{run.failed || ""}</td>
                  <td>{run.remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="crmEmpty">ولا دفعة اشتغلت لهلق.</p>
        )
      ) : tab === "failed" ? (
        groups.length ? (
          groups.map((group) => (
            <div className="crmCard crmPad" key={group.reason.kind} style={{ marginBottom: 10 }}>
              <strong>
                {group.reason.title} — {group.rows.length}
              </strong>
              <p className="crmNote">{group.reason.explanation}</p>
              {group.reason.action ? <p className="crmNote">{group.reason.action}</p> : null}
              <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
                {group.rows.map((row) => (
                  <li key={row.memberId}>
                    {shown(row)} · {row.phone}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="crmEmpty">ولا وحدة فشلت.</p>
        )
      ) : detail.pending.length ? (
        <ul style={{ margin: 0, paddingInlineStart: 18 }}>
          {detail.pending.map((row) => (
            <li key={row.memberId}>
              {shown(row)} · {row.phone}
            </li>
          ))}
        </ul>
      ) : (
        <p className="crmEmpty">ولا وحدة ناقصة — كلهن انبعتلهن.</p>
      )}
    </div>
  );
}
