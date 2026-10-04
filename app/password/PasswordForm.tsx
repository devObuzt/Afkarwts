"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PasswordForm({ mustChange }: { mustChange: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function save() {
    setBusy(true);
    setError("");

    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current, next })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "ما زبطت.");
      return;
    }

    setDone(true);
    router.replace("/new");
    router.refresh();
  }

  return (
    <section className="crmCard" data-tone="rose">
      <div className="crmPad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="crmField">
          <span>كلمة السر الحالية</span>
          <input
            autoComplete="current-password"
            onChange={(event) => setCurrent(event.target.value)}
            style={{ direction: "ltr", textAlign: "right" }}
            type="password"
            value={current}
          />
        </label>
        <label className="crmField">
          <span>كلمة السر الجديدة — 8 خانات وفوق</span>
          <input
            autoComplete="new-password"
            onChange={(event) => setNext(event.target.value)}
            style={{ direction: "ltr", textAlign: "right" }}
            type="password"
            value={next}
          />
        </label>

        {error && <p className="crmError">{error}</p>}

        <button
          className="crmBtn primary"
          disabled={busy || done || !current || next.length < 8}
          onClick={save}
          type="button"
        >
          {busy ? "عمّال يحفظ…" : done ? "انحفظت" : "احفظي"}
        </button>

        {!mustChange && (
          <a className="crmNote" href="/new" style={{ textAlign: "center" }}>
            رجوع
          </a>
        )}
      </div>
    </section>
  );
}
