"use client";

import { useRouter } from "next/navigation";
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
  const router = useRouter();
  /**
   * The value the server last rendered. Without it the effect below could
   * not tell «the page re-rendered» from «somebody else changed this», and
   * it reset the cell to the stale prop the instant the input closed — the
   * edit looked undone until a reload.
   */
  const fromServer = useRef(value);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    }
  }, [open]);

  // Follow the server only when the server actually says something new.
  useEffect(() => {
    if (value === fromServer.current) {
      return;
    }
    fromServer.current = value;
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
    fromServer.current = draft;
    setOpen(false);
    // The rest of the page reads the same registration — her name in the
    // header, the duplicate marks, the other screens' idea of her. Saving
    // one cell changes those too.
    router.refresh();
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
