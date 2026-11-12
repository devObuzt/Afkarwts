"use client";

import { useEffect, useRef, useState } from "react";

/**
 * نص العنوان الكامل ورا ثلاث نقط.
 *
 * 🔴 **سؤال الموافقة فقرة كاملة.** لما كان العنوان بينرسم بطوله، سطر
 * العناوين بيصير بعلو نص الشاشة — ومساحة فاضية على كل الأعمدة القصيرة
 * جنبه. فالعنوان صار **مقصوص بأربع سطور**، واللي انقص بيضل موجود ورا
 * الكبسة لمين بدّه يتأكد.
 *
 * بتسكّر بالكبس برّا أو بـEsc، وما بتطلع بالطباعة: الورقة بتاخد رمز
 * السؤال ومفتاحه تحتها أصلاً.
 */
export function HeadFull({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <span className="thMore" ref={box}>
      <button
        aria-expanded={open}
        aria-label="السؤال كامل"
        className="thMoreBtn"
        onClick={() => setOpen(!open)}
        type="button"
      >
        ⋯
      </button>
      {open ? (
        <span className="thMorePanel" role="note">
          {text}
        </span>
      ) : null}
    </span>
  );
}
