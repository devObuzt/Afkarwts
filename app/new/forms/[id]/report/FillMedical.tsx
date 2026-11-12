"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * تعبئة «ملاحظات طبية» من إجابات الاستمارة.
 *
 * بتعبّي الخانات الفاضية بس. اللي كتبه إنسان بيضل كما هو — فالكبسة
 * آمنة تتكبس مرة ومرتين وعشرة، وهاد المقصود: تنكبس بعد ما تتصحّح
 * إجابة، أو بعد ما يوصلوا تسجيلات جداد.
 */
export function FillMedical({ formId }: { formId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  async function run() {
    setBusy(true);
    setSaid("");
    const response = await fetch(`/api/forms/${formId}/medical`, { method: "POST" });
    const payload = (await response.json().catch(() => ({}))) as {
      filled?: number;
      error?: string;
    };
    setBusy(false);
    if (!response.ok) {
      setSaid(payload.error ?? "ما زبطت.");
      return;
    }
    setSaid(payload.filled ? `انعبّت ${payload.filled} خانة` : "ما في خانة فاضية تنعبّى");
    router.refresh();
  }

  return (
    <>
      <button className="crmBtn" disabled={busy} onClick={() => void run()} type="button">
        {busy ? "…" : "املا الطبي من الاستمارة"}
      </button>
      {said ? <span className="crmNote">{said}</span> : null}
    </>
  );
}
