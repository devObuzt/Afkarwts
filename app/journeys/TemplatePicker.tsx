"use client";

import { useEffect, useRef, useState } from "react";

export type PickerTemplate = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  paramCount: number;
  alias?: string;
  groups?: string[];
};

/**
 * A native select can only ever show a line of text, and Afkar's templates
 * differ by a word in the name — so on a pointer device this opens a list with
 * the body text beside it, previewed as the cursor moves. Touch devices keep
 * the native control, which is the better one there.
 */
export function TemplatePicker({
  templates,
  value,
  onChange
}: {
  templates: PickerTemplate[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [finePointer, setFinePointer] = useState(false);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Checked after mount so the server and the first client render agree.
    setFinePointer(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

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

  // Fifty-eight near-identical names are unreadable as a list, so the list
  // narrows two ways: by the words in the message, and by the shelf it sits on.
  const groupNames = Array.from(new Set(templates.flatMap((item) => item.groups ?? []))).sort();
  const needle = query.trim().toLowerCase();
  const shown = templates
    .filter((item) => (group ? (item.groups ?? []).includes(group) : true))
    .filter(
      (item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        (item.alias ?? "").toLowerCase().includes(needle) ||
        item.bodyText.toLowerCase().includes(needle)
    );

  const selected = templates.find((item) => item.name === value);
  const previewed = templates.find((item) => item.name === (hovered ?? value)) ?? null;

  if (!finePointer) {
    return (
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Choose a template…</option>
        {templates.map((item) => (
          <option key={`${item.name}:${item.language}`} value={item.name}>
            {item.alias ? `${item.alias} — ${item.name}` : item.name} — {item.category}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="picker" ref={boxRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="pickerButton"
        onClick={() => setOpen(!open)}
        type="button"
      >
        {selected ? (
          <span className="pickerChosen">
            <strong>{selected.alias || selected.name}</strong>
            {selected.alias ? <code>{selected.name}</code> : null}
            <span className={selected.category === "UTILITY" ? "badge" : "badge warn"}>{selected.category}</span>
          </span>
        ) : (
          <span className="pickerPlaceholder">Choose a template…</span>
        )}
        <span aria-hidden>▾</span>
      </button>

      {open ? (
        <div className="pickerPanel">
          <div className="pickerSearch">
            <input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the name, the internal name, or the words inside"
              value={query}
            />
            {groupNames.length ? (
              <div className="pickerGroups">
                <button className={group ? "chip" : "chip on"} onClick={() => setGroup("")} type="button">
                  All
                </button>
                {groupNames.map((name) => (
                  <button
                    className={group === name ? "chip on" : "chip"}
                    key={name}
                    onClick={() => setGroup(group === name ? "" : name)}
                    type="button"
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : null}
            <span className="hint">
              {shown.length} of {templates.length}
            </span>
          </div>

          <ul className="pickerList" role="listbox">
            {shown.map((item) => (
              <li key={`${item.name}:${item.language}`}>
                <button
                  className={item.name === value ? "current" : ""}
                  onClick={() => {
                    onChange(item.name);
                    setOpen(false);
                  }}
                  onFocus={() => setHovered(item.name)}
                  onMouseEnter={() => setHovered(item.name)}
                  role="option"
                  type="button"
                >
                  <span className="pickerName">{item.alias || item.name}</span>
                  {item.alias ? <code>{item.name}</code> : null}
                  <span className={item.category === "UTILITY" ? "badge" : "badge warn"}>{item.category}</span>
                </button>
              </li>
            ))}
            {!shown.length ? (
              <li>
                <p className="hint">Nothing matches. Clear the search, or pick another group.</p>
              </li>
            ) : null}
          </ul>

          <div className="pickerPreview">
            {previewed ? (
              <>
                <div className="previewMeta">
                  <span className={previewed.category === "UTILITY" ? "badge" : "badge warn"}>
                    {previewed.category}
                  </span>
                  <span>{previewed.language}</span>
                  {previewed.paramCount ? <span>{previewed.paramCount} variable(s)</span> : null}
                </div>
                <p className="previewBody">{previewed.bodyText || "(this template has no body text)"}</p>
                {previewed.category !== "UTILITY" ? (
                  <p className="previewWarn">
                    Meta classes this as {previewed.category}, whatever the name suggests. Marketing templates count
                    against each person&apos;s cap and some are withheld.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="hint">Point at a template to read it.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
