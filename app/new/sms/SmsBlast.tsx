"use client";

import { useState } from "react";
import { STOP_TOKEN } from "@/app/lib/sms/token";

type Label = { id: number; name: string; kind: string; memberCount: number };
type Preview = {
  sample: string;
  chars: number;
  segments: number;
  recipients: number;
  stopped: number;
  messages: number;
};

export function SmsBlast({ labels }: { labels: Label[] }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState(
    `بلاك فرايدي 20% على Clean وExtra+\nكود BLACKFRIDAY20 · الدفعة 15.11\nلحد 30.11\nlp.connec.co.il/afkar_bf\nوقف: ${STOP_TOKEN}`
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ sent: number; failed: number } | null>(null);

  async function call(go: boolean) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sms/blast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          labelIds: picked,
          text,
          go,
          expected: go ? preview?.recipients : undefined,
          limit: limit ? Number(limit) : undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "ما زبطت.");
      }
      if (go) {
        setDone({ sent: payload.sent, failed: payload.failed });
        setPreview(null);
      } else {
        setPreview(payload.preview);
        setDone(null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ما زبطت.");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: number) =>
    setPicked((current) => {
      setPreview(null);
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });

  return (
    <>
      <section className="crmCard crmPad">
        <header>
          <span className="crmDot" />
          <h2>لمين</h2>
        </header>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
          {labels.map((label) => (
            <button
              className={picked.includes(label.id) ? "crmBtn quiet primary" : "crmBtn quiet"}
              key={label.id}
              onClick={() => toggle(label.id)}
              type="button"
            >
              <bdi>{label.name}</bdi> <span style={{ opacity: 0.65 }}>{label.memberCount}</span>
            </button>
          ))}
        </div>
        <p className="crmNote">
          المسارات ما بتنعرض: المسار سجل لما اشتراه كل منتسب، مش قائمة إرسال. والتكرار بين الملصقات بينشال
          لحاله، واللي طلب إيقاف الرسائل بينشال كمان.
        </p>
      </section>

      <section className="crmCard crmPad">
        <header>
          <span className="crmDot" />
          <h2>النص</h2>
        </header>
        <label className="crmField full">
          <span>
            {STOP_TOKEN} بينبدل برابط إيقاف خاص بكل مستلمة — إلزامي، لأنّ اسم المرسل أبجدي وما بينرد عليه.
          </span>
          <textarea onChange={(event) => setText(event.target.value)} rows={7} value={text} />
        </label>
        <p className="crmNote">
          العربي بيجبر ترميز UCS-2: <strong>70 حرف</strong> للرسالة الواحدة، و<strong>67</strong> لكل مقطع بعدها.
          كل مقطع زيادة = رسالة زيادة لكل مستلمة.
        </p>
      </section>

      {error ? (
        <section className="crmCard crmPad" data-tone="clay">
          <p role="alert">{error}</p>
        </section>
      ) : null}

      {done ? (
        <section className="crmCard crmPad" data-tone="olive">
          <h2>انبعت</h2>
          <p>
            {done.sent} رسالة · فشل {done.failed}
          </p>
        </section>
      ) : null}

      {preview ? (
        <section className="crmCard crmPad" data-tone="sage">
          <header>
            <span className="crmDot" />
            <h2>معاينة</h2>
          </header>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "10px 0" }}>{preview.sample}</pre>
          <div className="crmRowDetail">
            {preview.chars} حرف · {preview.segments} مقطع للرسالة
          </div>
          <div className="crmRowDetail" style={{ marginTop: 6 }}>
            مستلمات: <strong>{preview.recipients}</strong> · انشالوا لأنهم طلبوا إيقاف: {preview.stopped}
          </div>
          <div className="crmRowTitle" style={{ marginTop: 8 }}>
            إجمالي الرسائل: {preview.messages}
          </div>
          <label className="crmField" style={{ marginTop: 12 }}>
            <span>حدّي العدد (اختياري — للتجربة على دفعة صغيرة أولاً)</span>
            <input
              inputMode="numeric"
              onChange={(event) => setLimit(event.target.value.replace(/\D/g, ""))}
              placeholder="مثلاً 10"
              value={limit}
            />
          </label>
          <button className="crmBtn primary" disabled={busy} onClick={() => call(true)} type="button">
            {busy ? "عم يبعت…" : limit ? `ابعتي لأول ${limit}` : `ابعتي للـ${preview.recipients}`}
          </button>
        </section>
      ) : null}

      <nav className="crmSearch">
        <button className="crmBtn" disabled={busy || !picked.length} onClick={() => call(false)} type="button">
          {busy ? "لحظة…" : "اعرضي المعاينة"}
        </button>
      </nav>
    </>
  );
}
