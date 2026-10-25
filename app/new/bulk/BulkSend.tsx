"use client";

import { useEffect, useState } from "react";

type Group = { id: number; name: string; memberCount: number };
type Template = {
  name: string;
  language: string;
  category: string;
  status: string;
  bodyText: string;
  paramCount: number;
  hasMediaHeader: boolean;
};
type BulkResult = { memberId: number; name: string; phone: string; status: string; error: string | null };

const NAME_TOKEN = "{{name}}";

export function BulkSend({ groups }: { groups: Group[] }) {
  const [step, setStep] = useState(1);
  const [groupId, setGroupId] = useState<number | "">("");
  const [mode, setMode] = useState<"template" | "text">("template");
  const [text, setText] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [chosen, setChosen] = useState<Template | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [skipAlreadySent, setSkipAlreadySent] = useState(true);
  const [maxRecipients, setMaxRecipients] = useState(250);
  const [limit, setLimit] = useState<{ dailyLimit: number; suggested: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handedOver, setHandedOver] = useState<{ total: number } | null>(null);
  const [results, setResults] = useState<{
    sent: number;
    failed: number;
    skipped: number;
    remaining: number;
    inFlight: boolean;
    rows: BulkResult[];
  } | null>(null);

  const group = groups.find((item) => item.id === groupId) ?? null;

  useEffect(() => {
    void (async () => {
      const [limits, list] = await Promise.all([
        fetch("/api/limits").then((response) => (response.ok ? response.json() : null)).catch(() => null),
        fetch("/api/templates").then((response) => (response.ok ? response.json() : null)).catch(() => null)
      ]);
      if (limits?.limit) {
        setLimit(limits.limit);
        setMaxRecipients(limits.limit.suggested);
      }
      setTemplates((list?.templates ?? []).filter((item: Template) => item.status === "APPROVED"));
    })();
  }, []);

  function pick(template: Template | null) {
    setChosen(template);
    setParams(template ? Array.from({ length: template.paramCount }, (_, at) => (at === 0 ? NAME_TOKEN : "")) : []);
  }

  const preview = chosen
    ? chosen.bodyText.replace(/\{\{(\d+)\}\}/g, (_, index) => params[Number(index) - 1] ?? `{{${index}}}`)
    : "";

  const ready =
    step === 1
      ? Boolean(groupId)
      : step === 2
        ? mode === "text"
          ? Boolean(text.trim())
          : Boolean(chosen)
        : true;

  async function send() {
    if (!groupId) {
      return;
    }
    setBusy(true);
    setError("");

    const payload = {
      groupId,
      mode,
      text,
      templateName: chosen?.name,
      templateLanguage: chosen?.language,
      bodyParams: params,
      bodyPreview: preview,
      skipAlreadySent,
      maxRecipients
    };

    // Anything big enough to need more than a couple of trips is handed to
    // the server, which keeps going whoever is watching — a laptop that
    // sleeps must not be what stops a send to three thousand people.
    if ((group?.memberCount ?? 0) > 200) {
      try {
        const response = await fetch("/api/messages/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, background: true })
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "ما زبط الإرسال.");
        }
        setHandedOver({ total: body.total ?? 0 });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "ما زبط الإرسال.");
      }
      setBusy(false);
      return;
    }

    /*
     * 🔴 The only thing that moves the server to the next slice is the
     * skip: each trip re-reads the group and takes the first N who have
     * not had this message. With the skip off there is no cursor, so
     * every trip would take the same N and send to them again — sixty
     * times over. One trip then, exactly as before.
     */
    const mayLoop = skipAlreadySent;
    const running = { sent: 0, failed: 0, skipped: 0, remaining: 0, rows: [] as BulkResult[] };
    setResults({ ...running, inFlight: true });

    try {
      for (let trip = 0; trip < (mayLoop ? 60 : 1); trip += 1) {
        const response = await fetch("/api/messages/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "ما زبط الإرسال.");
        }
        running.sent += body.sent ?? 0;
        running.failed += body.failed ?? 0;
        running.skipped += body.skipped ?? 0;
        running.remaining = body.remaining ?? 0;
        running.rows = [...running.rows, ...(body.results ?? [])];
        setResults({ ...running, inFlight: running.remaining > 0 && mayLoop });
        if (!running.remaining || !mayLoop) {
          break;
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "ما زبط الإرسال.");
    }

    setResults((current) => (current ? { ...current, inFlight: false } : current));
    setBusy(false);
  }

  if (handedOver) {
    return (
      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>الإرسال ماشي على الخادم</h2>
        </header>
        <div className="crmPad">
          <p className="crmNote">
            {handedOver.total} مستلمة. الإرسال بيكمّل حتى لو سكّرتي الصفحة أو نام الجهاز — بتتابعيه من
            «الحملات».
          </p>
          <a className="crmBtn" href="/new/campaigns" style={{ marginTop: 10 }}>
            فتح الحملات
          </a>
        </div>
      </section>
    );
  }

  return (
    <>
      <nav style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {["المجموعة", "الرسالة", "المراجعة"].map((label, at) => (
          <button
            className={step === at + 1 ? "crmBtn current" : "crmBtn"}
            key={label}
            onClick={() => setStep(at + 1)}
            type="button"
          >
            {at + 1} · {label}
          </button>
        ))}
      </nav>

      {step === 1 ? (
        <section className="crmCard crmPad">
          <label>
            لمين؟
            <select
              onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : "")}
              style={{ display: "block", marginTop: 6, width: "100%" }}
              value={groupId}
            >
              <option value="">اختاري مجموعة…</option>
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.memberCount})
                </option>
              ))}
            </select>
          </label>
          {group && group.memberCount > 200 ? (
            <p className="crmNote" style={{ marginTop: 8 }}>
              مجموعة كبيرة — الإرسال رح يمشي على الخادم وبيكمّل لحاله.
            </p>
          ) : null}
        </section>
      ) : null}

      {step === 2 ? (
        <section className="crmCard crmPad">
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button className={mode === "template" ? "crmBtn current" : "crmBtn"} onClick={() => setMode("template")} type="button">
              قالب معتمد
            </button>
            <button className={mode === "text" ? "crmBtn current" : "crmBtn"} onClick={() => setMode("text")} type="button">
              نص حر
            </button>
          </div>

          {mode === "text" ? (
            <>
              <textarea onChange={(event) => setText(event.target.value)} rows={5} style={{ width: "100%" }} value={text} />
              <p className="crmNote">
                النص الحر بيوصل بس اللي كتبتلنا خلال 24 ساعة. برّا النافذة ميتا بتقبل الطلب وبترمي
                الرسالة بلا خطأ — فاللي ما كتبت بدها قالب.
              </p>
            </>
          ) : (
            <>
              <select
                onChange={(event) => pick(templates.find((item) => item.name === event.target.value) ?? null)}
                style={{ display: "block", width: "100%" }}
                value={chosen?.name ?? ""}
              >
                <option value="">اختاري قالب…</option>
                {templates.map((item) => (
                  <option key={`${item.name}:${item.language}`} value={item.name}>
                    {item.name} · {item.language}
                  </option>
                ))}
              </select>
              {chosen?.paramCount ? (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {params.map((value, at) => (
                    <label key={at}>
                      القيمة {at + 1}
                      <input
                        onChange={(event) =>
                          setParams((all) => all.map((item, index) => (index === at ? event.target.value : item)))
                        }
                        style={{ display: "block", width: "100%", marginTop: 4 }}
                        value={value}
                      />
                    </label>
                  ))}
                  <p className="crmNote">
                    <code>{NAME_TOKEN}</code> بينستبدل باسم كل وحدة وقت الإرسال.
                  </p>
                </div>
              ) : null}
              {preview ? (
                <pre className="crmNote" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>
                  {preview}
                </pre>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {step === 3 ? (
        <section className="crmCard crmPad">
          <label style={{ display: "block", marginBottom: 10 }}>
            <input checked={skipAlreadySent} onChange={(event) => setSkipAlreadySent(event.target.checked)} type="checkbox" />{" "}
            تخطّي اللي وصلتها هاي الرسالة من قبل
          </label>
          {!skipAlreadySent ? (
            <p className="crmNote">
              بلا هاد ما في مؤشّر: الإرسال بياخد أول دفعة وبس، وما بيكمّل على الباقي — وهاد مقصود،
              لأن بلاه نفس الدفعة بتنعاد عليها مرات ومرات.
            </p>
          ) : null}

          <label style={{ display: "block", marginTop: 10 }}>
            أكبر عدد بهالدفعة
            <input
              max={limit?.dailyLimit ?? 10000}
              min={1}
              onChange={(event) => setMaxRecipients(Math.max(1, Number(event.target.value) || 1))}
              style={{ display: "block", marginTop: 4, width: 140 }}
              type="number"
              value={maxRecipients}
            />
          </label>
          {limit ? (
            <p className="crmNote">السقف اليومي عند ميتا: {limit.dailyLimit}. المقترح: {limit.suggested}.</p>
          ) : null}

          {error ? <p className="crmError">{error}</p> : null}

          <button className="crmBtn primary" disabled={busy || !groupId} onClick={() => void send()} style={{ marginTop: 12 }} type="button">
            {busy ? "ماشي…" : `ابعتي لـ${group?.memberCount ?? 0}`}
          </button>
        </section>
      ) : null}

      {step < 3 ? (
        <button className="crmBtn primary" disabled={!ready} onClick={() => setStep(step + 1)} style={{ marginTop: 12 }} type="button">
          كمّلي
        </button>
      ) : null}

      {results ? (
        <section className="crmCard" data-tone={results.failed ? "clay" : "sage"} style={{ marginTop: 14 }}>
          <header>
            <span className="crmDot" />
            <h2>{results.inFlight ? "ماشي…" : "خلص"}</h2>
          </header>
          <div className="crmPad">
            <p className="crmNote">
              قبلتها ميتا {results.sent} · فشلت {results.failed} · انتخطّت {results.skipped}
              {results.remaining ? ` · باقي ${results.remaining}` : ""}
            </p>
            <p className="crmNote">
              «قبلتها ميتا» مش «وصلت» — الوصول بتشوفيه بتقرير المسار أو بالمحادثة.
            </p>
            {results.rows.filter((row) => row.error).length ? (
              <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
                {results.rows
                  .filter((row) => row.error)
                  .slice(0, 40)
                  .map((row) => (
                    <li key={row.memberId}>
                      {row.name.trim() || row.phone} — {row.error}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
