"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The Hebrew name or town, which Afkar's records will rely on.
 *
 * A suggestion and a checked value are never drawn alike: until somebody
 * saves one, the cell is dimmed and carries a dot. Saving it — even
 * unchanged — is the act of confirming, which is why «احفظ كما هو» is a
 * real thing to do here and not a no-op.
 */
export function HebrewCell({
  confirmed,
  field,
  submissionId,
  value
}: {
  confirmed: boolean;
  field: "name" | "city";
  submissionId: number;
  value: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [sure, setSure] = useState(confirmed);
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const fromServer = useRef(value);

  useEffect(() => {
    if (open) {
      input.current?.focus();
      input.current?.select();
    }
  }, [open]);

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
    setBusy(true);
    const response = await fetch(`/api/forms/submissions/${submissionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hebrew: { [field]: draft } })
    });
    setBusy(false);
    if (!response.ok) {
      return;
    }
    setCurrent(draft);
    fromServer.current = draft;
    setSure(true);
    setOpen(false);
    router.refresh();
  }

  if (open) {
    return (
      <td>
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

  return (
    <td
      className={sure ? "heCell" : "heCell guess"}
      onDoubleClick={() => {
        setDraft(current);
        setOpen(true);
      }}
      title={sure ? "مؤكَّد · نقرتان للتعديل" : "اقتراح — نقرتان للتأكيد أو التعديل"}
    >
      {current || "—"}
      {!sure && current && <span className="guessDot"> ●</span>}
    </td>
  );
}
