"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * «تجاهل» — بتشيل المهمة من شاشة اليوم وبس.
 *
 * مش حذف: التسجيل بيضل بانتظار المراجعة، والتذكير بيضل مفتوح. وإذا إجا
 * جديد على نفس المهمة بترجع تبيّن لحالها، لأنها ساعتها صارت شغل تاني.
 */
export function DismissDecision({ itemKey }: { itemKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function dismiss() {
    setBusy(true);
    setFailed(false);
    const response = await fetch("/api/today/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: itemKey })
    });
    setBusy(false);

    if (!response.ok) {
      // بلا هاد الصفّ بيضل مكانه والسبب مجهول — والواحد بيكبس كمان مرة.
      setFailed(true);
      return;
    }
    router.refresh();
  }

  return (
    <button
      className="crmBtn quiet"
      disabled={busy}
      onClick={() => void dismiss()}
      title="تنشال من شاشة اليوم — بتضل بمكانها بالطابور"
      type="button"
    >
      {failed ? "ما زبطت — جرّبي كمان مرة" : busy ? "…" : "تجاهل"}
    </button>
  );
}
