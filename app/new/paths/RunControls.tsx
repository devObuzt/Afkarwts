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
  canDelete = false,
  journeyId,
  status
}: {
  /** صفر إرساليات — يعني ما لمس ولا منتسبة، فبينمحى. */
  canDelete?: boolean;
  journeyId: number;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asking, setAsking] = useState(false);

  async function remove() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/journeys/${journeyId}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "ما زبطت.");
      return;
    }
    router.push("/new/paths");
    router.refresh();
  }

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

  if (status === "done" && !canDelete) {
    return null;
  }

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {status === "done" ? null : status === "active" ? (
        <button className="crmBtn" disabled={busy} onClick={() => void set("paused")} type="button">
          وقّفي المسار
        </button>
      ) : (
        <button className="crmBtn primary" disabled={busy} onClick={() => void set("active")} type="button">
          {status === "paused" ? "كمّلي المسار" : "شغّلي المسار"}
        </button>
      )}
      {canDelete && status !== "active" ? (
        asking ? (
          <>
            <button className="crmBtn danger" disabled={busy} onClick={() => void remove()} type="button">
              {busy ? "…" : "أكيد، امحيه"}
            </button>
            <button className="crmBtn quiet" disabled={busy} onClick={() => setAsking(false)} type="button">
              إلغاء
            </button>
          </>
        ) : (
          <button
            className="crmBtn quiet"
            disabled={busy}
            onClick={() => setAsking(true)}
            title="هاد المسار ما بعت ولا رسالة"
            type="button"
          >
            امحي المسار
          </button>
        )
      ) : null}
      {error ? <span className="crmError">{error}</span> : null}
    </span>
  );
}
