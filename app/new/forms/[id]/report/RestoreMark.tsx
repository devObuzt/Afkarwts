"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The way back from a rejection.
 *
 * A reject is pressed on a crowded table and sometimes on the wrong row,
 * and from that moment the registration is out of every list — which is
 * the point of it, and also why it needs a door. Pressing this puts her
 * back among «بانتظار المراجعة», not into the group: letting her in
 * stays its own decision.
 */
export function RestoreMark({ submissionId }: { submissionId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/leads/${submissionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" })
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "تعذّر الإرجاع.");
      return;
    }
    // The row leaves this view the moment it is restored, so the table
    // has to be read again rather than patched on screen.
    router.refresh();
  }

  return (
    <span className="dupMark">
      <button className="crmBtn" disabled={busy} onClick={restore} type="button" title="إرجاعه إلى بانتظار المراجعة">
        {busy ? "…" : "أرجعه"}
      </button>
      {error && <span className="crmError">{error}</span>}
    </span>
  );
}
