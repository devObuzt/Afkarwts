"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A cell in the registrations table that can be corrected where it is read.
 *
 * Double-click, type, Enter. Escape puts it back. The save is the same
 * route the full editor uses, so the submission's name, phone and town are
 * re-derived on the server — correcting a phone here changes the number
 * «أضف للمجموعة» will use, exactly as it does on the other screen.
 */
export function EditableCell({
  answerId,
  className,
  submissionId,
  value
}: {
  answerId: number | null;
  className?: string;
  submissionId: number;
  value: string;
}) {
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    }
  }, [open]);

  // A re-render from router.refresh() must not overwrite what is being typed.
  useEffect(() => {
    if (!open) {
      setCurrent(value);
      setDraft(value);
    }
  }, [value, open]);

  async function save() {
    if (draft === current) {
      setOpen(false);
      return;
    }

    setBusy(true);
    setFailed("");
    const response = await fetch(`/api/forms/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ edits: [{ answerId, value: draft }] })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setFailed(payload.error ?? "تعذّر الحفظ.");
      return;
    }

    setCurrent(draft);
    setOpen(false);
  }

  // Nothing to patch: the question was never answered on this registration.
  if (answerId === null) {
    return <td className={className}>{current}</td>;
  }

  if (!open) {
    return (
      <td
        className={className}
        onDoubleClick={() => {
          setDraft(current);
          setOpen(true);
        }}
        title={failed || "نقرتان للتعديل"}
      >
        {current}
        {failed && <span className="cellFailed"> ✕</span>}
      </td>
    );
  }

  return (
    <td className={className}>
      <input
        className="cellEdit"
        disabled={busy}
        onBlur={save}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
          if (event.key === "Escape") {
            setDraft(current);
            setOpen(false);
          }
        }}
        ref={input}
        type="text"
        value={draft}
      />
    </td>
  );
}
