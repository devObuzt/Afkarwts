"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Starting, pausing and resuming a journey.
 *
 * It was only ever possible from the old screen, so the new one could
 * show a path running and give no way to stop it — the one control you
 * reach for when something is going out wrong.
 */
export function RunControls({
  journeyId,
  status
}: {
  journeyId: number;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function set(next: "active" | "paused") {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/journeys/${journeyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "ما زبطت.");
      return;
    }
    router.refresh();
  }

  if (status === "done") {
    return null;
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {status === "active" ? (
        <button className="crmBtn" disabled={busy} onClick={() => void set("paused")} type="button">
          وقّفي المسار
        </button>
      ) : (
        <button className="crmBtn primary" disabled={busy} onClick={() => void set("active")} type="button">
          {status === "paused" ? "كمّلي المسار" : "شغّلي المسار"}
        </button>
      )}
      {error ? <span className="crmError">{error}</span> : null}
    </span>
  );
}
