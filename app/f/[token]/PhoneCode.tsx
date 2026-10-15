"use client";

import { useEffect, useState } from "react";

/**
 * Proving the number is hers, before she can send the form.
 *
 * The number is the whole programme: every message of the cohort goes to
 * it, and a slip of one digit meant two women turned up in the table as
 * one, and one of them was never reachable at all. A code at the door
 * costs her twenty seconds and takes that away.
 *
 * WhatsApp first, because the cohort itself runs on WhatsApp — a number
 * that cannot take the code cannot take the programme either. SMS is one
 * press away for the woman whose WhatsApp is on a different phone, and it
 * is also where a refused WhatsApp send lands on its own.
 */
export function PhoneCode({
  onVerified,
  phone,
  token,
  verified
}: {
  onVerified: (value: boolean) => void;
  phone: string;
  token: string;
  verified: boolean;
}) {
  const [sent, setSent] = useState<"whatsapp" | "sms" | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [wait, setWait] = useState(0);

  const digits = phone.replace(/\D/g, "");
  const looksLikeAPhone = digits.length >= 9;

  // Changing the number after proving it undoes the proof: what was
  // verified was the old number.
  useEffect(() => {
    setSent(null);
    setCode("");
    setNote("");
    onVerified(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const timer = setTimeout(() => setWait((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function send(channel: "whatsapp" | "sms") {
    setBusy(true);
    setNote("");
    const response = await fetch(`/api/f/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", phone, channel })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setNote(payload.error ?? "تعذّر إرسال الكود.");
      if (payload.retryAfter) setWait(Number(payload.retryAfter));
      return;
    }
    // What carried it, not what was asked for: WhatsApp may have refused
    // and the code gone out by SMS instead.
    setSent(payload.channel === "sms" ? "sms" : "whatsapp");
    setWait(60);
  }

  async function check() {
    setBusy(true);
    setNote("");
    const response = await fetch(`/api/f/${token}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "check", phone, code })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setNote(payload.error ?? "الكود غير صحيح.");
      return;
    }
    setNote("");
    onVerified(true);
  }

  if (verified) {
    return <p className="codeDone">✓ تم تأكيد الرقم</p>;
  }

  if (!looksLikeAPhone) {
    return <p className="codeHint">اكتبي رقمك ثم أرسلي كود التأكيد.</p>;
  }

  return (
    <div className="codeBox">
      {!sent ? (
        <>
          <button className="codeBtn" disabled={busy} onClick={() => send("whatsapp")} type="button">
            {busy ? "…" : "أرسلوا لي كود على واتساب"}
          </button>
          <button className="codeLink" disabled={busy} onClick={() => send("sms")} type="button">
            أو برسالة نصية
          </button>
        </>
      ) : (
        <>
          <p className="codeHint">
            {sent === "sms" ? "بعثنا الكود برسالة نصية" : "بعثنا الكود على واتساب"} إلى{" "}
            <span className="codeNum">{phone}</span>
          </p>
          <div className="codeRow">
            <input
              autoComplete="one-time-code"
              className="codeInput"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="——————"
              value={code}
            />
            <button className="codeBtn" disabled={busy || code.length < 6} onClick={check} type="button">
              {busy ? "…" : "تأكيد"}
            </button>
          </div>
          <button
            className="codeLink"
            disabled={busy || wait > 0}
            onClick={() => send(sent === "sms" ? "whatsapp" : "sms")}
            type="button"
          >
            {wait > 0
              ? `إعادة الإرسال بعد ${wait} ثانية`
              : sent === "sms"
                ? "ما وصلني — جرّبوا واتساب"
                : "ما وصلني — ابعثوه برسالة نصية"}
          </button>
        </>
      )}
      {note && <p className="codeNote">{note}</p>}
    </div>
  );
}
