"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Free text, with the 24-hour window stated before she types. Outside it
 * WhatsApp accepts the send and drops it without an error, so the honest
 * thing is to point her at a template instead of letting her write into air.
 */
export function PersonReply({
  memberId,
  windowOpen,
  windowClosesAt
}: {
  memberId: number;
  windowOpen: boolean;
  windowClosesAt: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setBusy(true);
    setError("");

    const response = await fetch("/api/messages/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, text })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "الإرسال فشل.");
      return;
    }

    setText("");
    router.refresh();
  }

  const closes = windowClosesAt
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jerusalem",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date(windowClosesAt))
    : "";

  return (
    <section className="crmCard" data-tone={windowOpen ? "mint" : "apricot"}>
      <header>
        <span className="crmDot" />
        <h2>ردّي عليها</h2>
        <span className="crmPill tone spacer">
          {windowOpen ? `النافذة مفتوحة لـ${closes}` : "النافذة مسكّرة"}
        </span>
      </header>
      <div className="crmPad">
        {windowOpen ? (
          <>
            <textarea
              onChange={(event) => setText(event.target.value)}
              placeholder="اكتبي ردّك…"
              value={text}
            />
            {error && (
              <p className="crmError" style={{ marginTop: 12 }}>
                {error}
              </p>
            )}
            <button
              className="crmBtn primary"
              disabled={busy || !text.trim()}
              onClick={send}
              style={{ marginTop: 12 }}
              type="button"
            >
              {busy ? "عمّال يبعت…" : "ابعتي"}
            </button>
          </>
        ) : (
          <>
            <p className="crmNote" style={{ fontSize: 13.5 }}>
              صار أكثر من 24 ساعة من آخر رسالة منها، فالنص الحر ما بيوصل — واتساب بيقبله وبيرميه بلا خطأ. لازم قالب
              معتمد.
            </p>
            <a className="crmBtn" href="/templates" style={{ marginTop: 12 }}>
              افتحي القوالب
            </a>
          </>
        )}
      </div>
    </section>
  );
}
