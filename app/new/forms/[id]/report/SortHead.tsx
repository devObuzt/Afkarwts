"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * ترتيب الجدول أبجدياً على عمود.
 *
 * 🔑 **الترتيب بينحفظ، مش عرض مؤقت.** الجدول وExcel وPDF كلهن بيقروا
 * من نفس الترتيب المحفوظ — فلو كانت الكبسة بترتّب الشاشة وبس، بتصير
 * الشاشة تعرض إشي والتنزيل إشي تاني. وهاد بالضبط العطل اللي طلع
 * بالسحب أول مرة.
 *
 * الكبسة الأولى بترتّب طالع، والتانية بتعكس.
 */
export function SortHead({
  by,
  formId,
  label
}: {
  by: "name" | "hebrewName" | "city";
  formId: number;
  label: string;
}) {
  const router = useRouter();
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [busy, setBusy] = useState(false);

  async function sort() {
    const next = dir;
    setBusy(true);
    const response = await fetch(`/api/forms/${formId}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sortBy: by, dir: next })
    });
    setBusy(false);
    if (!response.ok) {
      return;
    }
    setDir(next === "asc" ? "desc" : "asc");
    router.refresh();
  }

  return (
    <button
      className="thSort"
      disabled={busy}
      onClick={() => void sort()}
      title={`رتّبي أبجدياً حسب ${label}`}
      type="button"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="thSortMark">
        {busy ? "…" : dir === "asc" ? "↓" : "↑"}
      </span>
    </button>
  );
}
