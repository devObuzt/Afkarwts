"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * ترتيب الجدول حسب مسار التوصيل.
 *
 * الشمال ← المركز ← الجنوب ← القدس والضفة، وجوّا كل منطقة من الأقصى
 * شمالاً نازل. بينحفظ زي السحب بالضبط — فالشاشة وExcel وPDF كلهن
 * بيتبعوه بلا ما يلزم ولا كبسة زيادة.
 *
 * 🔑 **نقطة بداية مش حكم:** بعد الكبسة بتسحب السطور بإيدك وسحبك
 * بينحفظ فوقه. ولهيك البلد اللي ما بنعرفها بتنزل بالآخر **وبينقال
 * اسمها** — بدل ما تنحشر بمكان قريب وتضيع بمسار توصيل.
 */
export function OfficialOrder({ formId }: { formId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "official" | "reset" | "forget">("");
  const [said, setSaid] = useState("");

  async function run(what: "official" | "reset" | "forget") {
    setBusy(what);
    setSaid("");
    const response = await fetch(`/api/forms/${formId}/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        what === "official" ? { official: true } : what === "forget" ? { forget: true } : { reset: true }
      )
    });
    const payload = (await response.json().catch(() => ({}))) as {
      placed?: number;
      unplaced?: number;
      unknownTowns?: string[];
      error?: string;
    };
    setBusy("");
    if (!response.ok) {
      setSaid(payload.error ?? "ما زبطت.");
      return;
    }
    setSaid(
      what === "forget"
        ? "انمحى المسار المتعلَّم"
        : what === "reset"
        ? "رجع الترتيب الأصلي"
        : payload.unplaced
          ? `انرتّب ${payload.placed} سطر · ${payload.unplaced} بالآخر بلا منطقة: ${(payload.unknownTowns ?? []).join("، ")}`
          : `انرتّب ${payload.placed} سطر`
    );
    router.refresh();
  }

  return (
    <>
      <button className="crmBtn" disabled={Boolean(busy)} onClick={() => void run("official")} type="button">
        {busy === "official" ? "…" : "ترتيب رسمي"}
      </button>
      <button
        className="crmBtn quiet"
        disabled={Boolean(busy)}
        onClick={() => void run("reset")}
        title="بيشيل الترتيب الرسمي وكل سحب بالإيد"
        type="button"
      >
        {busy === "reset" ? "…" : "رجّع الأصلي"}
      </button>
      <button
        className="crmBtn quiet"
        disabled={Boolean(busy)}
        onClick={() => void run("forget")}
        title="بينسى ترتيب البلاد اللي اتعلّمه من السحب، فيرجع الترتيب الرسمي للجغرافيا"
        type="button"
      >
        {busy === "forget" ? "…" : "انسى المسار"}
      </button>
      {said ? <span className="crmNote">{said}</span> : null}
    </>
  );
}
