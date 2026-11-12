"use client";

import { useEffect } from "react";

/**
 * بيخلّي طرف الجدول السفلي يقعد بالضبط على طرف الشاشة.
 *
 * 🔴 **التخمين ما زبط.** أول نسخة حطّت `max-height: calc(100svh - 196px)`
 * — والـ196 كانت تقدير لشريط التنقّل وأدوات التقرير فوق الجدول. على
 * شاشة أوطى أو مع سطر ملاحظات زيادة، الشريط فوق بيصير أطول، فطرف
 * الجدول بينزل تحت حدود الشاشة: ساعتها السكرول الأفقي بيصير مخفي،
 * ولما تنزل الصفحة عشان توصله بيتحرّك السكرول العمودي معك.
 *
 * فبدل ما نخمّن الشريط فوق، بنقيس **وين الجدول بلّش فعلاً** وبنعطيه
 * اللي باقي من الشاشة. والقياس بينعاد مع كل تغيير حجم — وعلى الموبايل
 * بتنشال الحدود كلها وبيرجع الجدول يمتد بطوله.
 */
const GAP = 14;
const FLOOR = 260;

export function GridFit() {
  useEffect(() => {
    const box = document.querySelector<HTMLElement>(".gridScroll");
    if (!box) {
      return;
    }

    function fit() {
      if (!box) {
        return;
      }
      // تحت 700 بكسل ارتفاع، تحديد الجدول بيخنقه أكتر ما بيساعد.
      if (window.innerHeight < 700 && window.innerWidth < 900) {
        box.style.removeProperty("max-height");
        return;
      }
      const top = box.getBoundingClientRect().top;
      const room = window.innerHeight - top - GAP;
      box.style.maxHeight = `${Math.max(FLOOR, Math.round(room))}px`;
    }

    fit();
    window.addEventListener("resize", fit);
    // الشريط فوق بيكبر وبيصغر: رسالة «انحفظ الترتيب» بتزيد سطر،
    // وأزرار الحالات بتلتف على سطرين. بلا مراقبة، القياس بيصير قديم
    // بعد أول كبسة.
    const watch = new ResizeObserver(fit);
    const head = box.parentElement;
    if (head) {
      watch.observe(head);
    }

    return () => {
      window.removeEventListener("resize", fit);
      watch.disconnect();
      box.style.removeProperty("max-height");
    };
  }, []);

  return null;
}
