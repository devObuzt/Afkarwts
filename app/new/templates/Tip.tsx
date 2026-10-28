"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * قواعد ميتا للقوالب قاسية ومعظمها مخفي — هيدر فيه إيموجي، نص بيقرا
 * ككود دخول، اسم ما بينعاد استعماله بعد رفضة وحدة. بدل حيط تحذيرات فوق
 * الاستمارة، كل حقل بيحمل شرحه ورا «؟».
 */
export function Tip({ title, children }: { title: string; children: ReactNode }) {
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
    <span className="crmTip" ref={box}>
      <button
        aria-expanded={open}
        aria-label={`شو يعني ${title}؟`}
        className="crmTipBtn"
        onClick={() => setOpen(!open)}
        type="button"
      >
        ؟
      </button>
      {open ? (
        <span className="crmTipPanel" role="note">
          <strong>{title}</strong>
          {children}
        </span>
      ) : null}
    </span>
  );
}
