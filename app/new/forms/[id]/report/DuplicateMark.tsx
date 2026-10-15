"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Two registrations, one phone, one form — she filled it twice.
 *
 * The mark stays on both rows after they are approved, because that is
 * when the duplicate actually hurts: two records, two welcome messages,
 * two places to look. Rejecting one here marks that registration rejected
 * and leaves the منتسبة alone — she is a real person who registered, and
 * the other registration is still hers.
 */
export function DuplicateMark({
  canReject,
  state,
  submissionId,
  twins
}: {
  canReject: boolean;
  state: string;
  submissionId: number;
  twins: number[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(state === "rejected");
  const [error, setError] = useState("");

  if (twins.length === 0) {
    return null;
  }

  if (done) {
    return <span className="crmPill">مرفوض</span>;
  }

  async function reject() {
    if (!confirm("رفض هذا التسجيل كتكرار؟ المنتسبة لا تُحذف — التسجيل الآخر يبقى لها.")) {
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch(`/api/leads/${submissionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" })
    });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "تعذّر الرفض.");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <span className="dupMark">
      <span className="crmPill alert" title={`نفس رقم الهاتف في التسجيل ${twins.join("، ")}`}>
        تكرار
      </span>
      {canReject && (
        <button className="crmBtn danger" disabled={busy} onClick={reject} type="button">
          {busy ? "…" : "ارفض"}
        </button>
      )}
      {error && <span className="crmError">{error}</span>}
    </span>
  );
}
