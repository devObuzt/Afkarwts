"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Morning is slow — 300 invoices is 300 requests — so the pull is explicit. */
export function SyncButton({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function sync() {
    setBusy(true);
    setError("");
    setDone("");

    const response = await fetch("/api/income/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "تعذّرت المزامنة.");
      return;
    }

    setDone(`${payload.written} فاتورة · ${payload.linked} ارتبطت بمنتسب`);
    router.refresh();
  }

  return (
    <>
      <button className="crmBtn quiet spacer" disabled={busy} onClick={sync} type="button">
        {busy ? "جارٍ السحب من Morning…" : "تحديث من Morning"}
      </button>
      {error && (
        <p className="crmError" style={{ flexBasis: "100%", marginTop: 10 }}>
          {error}
        </p>
      )}
      {done && (
        <p className="crmNote" style={{ flexBasis: "100%", marginTop: 8 }}>
          {done}
        </p>
      )}
    </>
  );
}
