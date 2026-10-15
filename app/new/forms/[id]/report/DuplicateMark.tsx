"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The same woman, twice on one form.
 *
 * «تكرار» is the same phone: proof. «تشابه» is the same name with a
 * different phone — which is how the two that mattered actually looked,
 * because each mistyped her number the second time and the phone match
 * read «0» over a real pair. Two women do share a name, so that one asks
 * before it rejects.
 *
 * The mark stays on both rows after they are approved, because that is
 * when the duplicate actually hurts: two records, two welcome messages,
 * two places to look. Rejecting one here marks that registration rejected
 * and leaves the منتسبة alone — she is a real person who registered, and
 * the other registration is still hers.
 */
export function DuplicateMark({
  canReject,
  similar,
  state,
  submissionId,
  twins
}: {
  canReject: boolean;
  /** Same name, or a phone one keystroke away — likely, not certain. */
  similar: number[];
  state: string;
  submissionId: number;
  twins: number[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(state === "rejected");
  const [error, setError] = useState("");

  if (twins.length === 0 && similar.length === 0) {
    return null;
  }

  // Same phone is proof; same name is a question. They must not look alike
  // on the table, because one of them is a reason to act and one is not.
  const certain = twins.length > 0;
  const others = certain ? twins : similar;

  if (done) {
    return <span className="crmPill">مرفوض</span>;
  }

  async function reject() {
    const question = certain
      ? "رفض هذا التسجيل كتكرار؟ المنتسبة لا تُحذف — التسجيل الآخر يبقى لها."
      : `نفس الاسم في التسجيل ${others.join("، ")} لكن الرقم مختلف. تأكّدت أنها نفس الشخص؟`;
    if (!confirm(question)) {
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
      <span
        className={certain ? "crmPill alert" : "crmPill warn"}
        title={
          certain
            ? `نفس رقم الهاتف في التسجيل ${twins.join("، ")}`
            : `نفس الاسم في التسجيل ${similar.join("، ")} — الرقم مختلف، افحصه قبل الرفض`
        }
      >
        {certain ? "تكرار" : "تشابه"}
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
