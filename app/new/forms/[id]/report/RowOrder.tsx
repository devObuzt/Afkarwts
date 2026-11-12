"use client";

import { useEffect, useState } from "react";

/**
 * سحب السطر لمكانه.
 *
 * الجدول بينبنى على السيرفر، والمقبض بينزرع هون على السطور الموجودة —
 * نفس طريقة `ColumnSizing`: شغلة بصرية ما بتستاهل تتمرّر عبر خمس أماكن
 * بتبني خانات الجدول.
 *
 * 🔑 **بيشتغل بس على القائمة الكاملة بلا بحث ولا فلتر.** السحب بيحفظ
 * **القائمة كما هي معروضة**، فلو كان الفلتر شغّال رح نكون عم نرقّم جزء
 * من الصفوف ونترك الباقي — والنتيجة ترتيب ما حدا طلبه. لهيك المقبض
 * بيختفي مع البحث والفلتر بدل ما يشتغل غلط بصمت.
 *
 * ⚠️ والسطر المسحوب بينقّل بالـDOM فوراً، قبل ما يرد السيرفر: السحب
 * لازم يحس فوري. وإذا فشل الحفظ بترجع الصفحة تتقرا من جديد فيرجع
 * الترتيب المحفوظ — ما منخلّي الشاشة تكذب.
 */
export function RowOrder({ formId }: { formId: number }) {
  const [said, setSaid] = useState("");

  useEffect(() => {
    const table = document.querySelector<HTMLTableElement>(".gridTable");
    const body = table?.querySelector("tbody");
    if (!table || !body) {
      return;
    }

    let dragging: HTMLTableRowElement | null = null;
    const rows = () => Array.from(body.querySelectorAll<HTMLTableRowElement>("tr[data-id]"));

    const grips: HTMLElement[] = [];
    for (const row of rows()) {
      const cell = row.querySelector<HTMLTableCellElement>("td.colIndex");
      if (!cell || cell.querySelector(".rowGrip")) {
        continue;
      }
      const grip = document.createElement("span");
      grip.className = "rowGrip";
      grip.title = "اسحبي السطر لمكانه";
      grip.setAttribute("aria-hidden", "true");
      // ⠿ — النقط الستة. المقبض المتعارف عليه للسحب، وبينقرا كمقبض
      // بلا ما يحتاج شرح ولا صورة.
      grip.textContent = "⠿";
      grip.draggable = true;
      cell.prepend(grip);
      grips.push(grip);
    }

    function onDragStart(event: DragEvent) {
      const grip = event.target as HTMLElement;
      if (!grip.classList?.contains("rowGrip")) {
        return;
      }
      dragging = grip.closest("tr");
      if (!dragging) {
        return;
      }
      dragging.classList.add("rowDragging");
      event.dataTransfer?.setData("text/plain", dragging.dataset.id ?? "");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    }

    function onDragOver(event: DragEvent) {
      if (!dragging) {
        return;
      }
      event.preventDefault();
      const over = (event.target as HTMLElement).closest?.("tr[data-id]") as HTMLTableRowElement | null;
      if (!over || over === dragging) {
        return;
      }
      // نص السطر هو الحد: فوقه بينحط قبله، تحته بينحط بعده.
      const box = over.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      over.parentElement?.insertBefore(dragging, after ? over.nextSibling : over);
    }

    async function onDragEnd() {
      if (!dragging) {
        return;
      }
      dragging.classList.remove("rowDragging");
      dragging = null;

      const ids = rows().map((row) => Number(row.dataset.id));
      renumber();
      setSaid("…");
      const response = await fetch(`/api/forms/${formId}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setSaid(payload.error ?? "ما انحفظ الترتيب");
        // الشاشة بتكذب لو ضل السطر بمكانه الجديد وهو مش محفوظ.
        window.location.reload();
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as { learned?: number };
      // لما تكون البلاد متلمّة، السحب بيعلّم المسار — وبينقال، لأنه
      // تغيير بيأثّر على كل دفعة جاية مش على هاي الصفحة وبس.
      setSaid(payload.learned ? `انحفظ الترتيب · واتعلّم مسار ${payload.learned} بلد` : "انحفظ الترتيب");
      window.setTimeout(() => setSaid(""), 4000);
    }

    /** الأرقام بتتبع العين: السطر الأول واحد مهما كان أصله. */
    function renumber() {
      rows().forEach((row, index) => {
        const cell = row.querySelector<HTMLTableCellElement>("td.colIndex");
        if (!cell) {
          return;
        }
        const link = cell.querySelector("a");
        if (link) {
          link.textContent = String(index + 1);
          return;
        }
        // بلا رابط: بنكتب الرقم ونرجّع المقبض، لأنّ `textContent`
        // بتمسح جوّا الخانة كله والمقبض منها.
        const grip = cell.querySelector(".rowGrip");
        cell.textContent = String(index + 1);
        if (grip) {
          cell.prepend(grip);
        }
      });
    }

    body.addEventListener("dragstart", onDragStart);
    body.addEventListener("dragover", onDragOver);
    body.addEventListener("dragend", onDragEnd);
    body.addEventListener("drop", (event) => event.preventDefault());

    return () => {
      body.removeEventListener("dragstart", onDragStart);
      body.removeEventListener("dragover", onDragOver);
      body.removeEventListener("dragend", onDragEnd);
      for (const grip of grips) {
        grip.remove();
      }
    };
  }, [formId]);

  return said ? <span className="crmNote">{said}</span> : null;
}
