"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Meta's template rules are unforgiving and mostly invisible — a header that
 * holds an emoji, a body that reads as an access code, a name that cannot be
 * reused after one rejection. Rather than a wall of warnings above the form,
 * each field carries its own explanation behind an "i".
 */
export function InfoTip({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="infoTip" ref={boxRef}>
      <button
        aria-expanded={open}
        aria-label={`What is ${title}?`}
        className="infoTipButton"
        onClick={() => setOpen(!open)}
        type="button"
      >
        i
      </button>
      {open ? (
        <span className="infoTipPanel" role="note">
          <strong>{title}</strong>
          {children}
        </span>
      ) : null}
    </span>
  );
}
