"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * حالة «أوقف الرسائل» على صفحة المنتسب، مع طريق رجعة بإيد الطاقم.
 *
 * ليش الرجعة لازمة: الإيقاف بينصاد من كلمة بالواتساب كمان، وأي قراءة
 * آلية لكلام البشر بتغلط مرة. بلا زر رجعة، غلطة وحدة بتقطع العروض عن
 * زبونة فعلية ولا حد بيعرف ليش.
 */
export function PersonOptOut({
  memberId,
  optOutAt,
  sourceLabel,
  canEdit
}: {
  memberId: number;
  optOutAt: string | null;
  sourceLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "stop" | "resume") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/people/${memberId}/opt-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "تعذّر التنفيذ.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذّر التنفيذ.");
    } finally {
      setBusy(false);
    }
  }

  if (!optOutAt) {
    if (!canEdit) {
      return null;
    }
    return (
      <button className="crmBtn quiet" disabled={busy} onClick={() => act("stop")} type="button">
        {busy ? "لحظة…" : "أوقف رسائل العروض"}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span className="crmPill warn" title={sourceLabel}>
        أوقف رسائل العروض
      </span>
      {canEdit && (
        <button className="crmBtn quiet" disabled={busy} onClick={() => act("resume")} type="button">
          {busy ? "لحظة…" : "رجّع الرسائل"}
        </button>
      )}
    </div>
  );
}
