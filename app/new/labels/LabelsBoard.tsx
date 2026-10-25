"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIND_DETAIL, KIND_LABEL, LABEL_KINDS, type LabelKind } from "@/app/lib/labels/kinds";
import { LABEL_COLOURS, colourForLabel, inkOnLabel } from "@/app/lib/labels/colours";
import type { Label } from "@/app/lib/labels/store";

export function Chip({ label }: { label: { name: string; colour?: string } }) {
  const background = colourForLabel(label);
  return (
    <span className="labelChip" style={{ background, color: inkOnLabel(background) }}>
      {label.name}
    </span>
  );
}

export function LabelsBoard({ canEdit, labels }: { canEdit: boolean; labels: Label[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<LabelKind>("state");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!name.trim()) {
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/labels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), kind })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "ما زبطت.");
      return;
    }
    setName("");
    router.refresh();
  }

  async function recolour(label: Label, colour: string) {
    setBusy(true);
    await fetch(`/api/labels/${label.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: label.kind, colour })
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <>
      {canEdit ? (
        <section className="crmCard crmPad">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void add();
                }
              }}
              placeholder="ملصق جديد — حامل، نباتي، بانتظار دفعة…"
              style={{ flex: "1 1 220px" }}
              value={name}
            />
            <select onChange={(event) => setKind(event.target.value as LabelKind)} value={kind}>
              {LABEL_KINDS.map((item) => (
                <option key={item} value={item}>
                  {KIND_LABEL[item]}
                </option>
              ))}
            </select>
            <button className="crmBtn primary" disabled={busy || !name.trim()} onClick={() => void add()} type="button">
              أضيفي
            </button>
          </div>
          <p className="crmNote" style={{ marginTop: 8 }}>{KIND_DETAIL[kind]}</p>
          {error ? <p className="crmError">{error}</p> : null}
        </section>
      ) : null}

      {LABEL_KINDS.map((item) => {
        const inKind = labels.filter((label) => label.kind === item);
        if (!inKind.length) {
          return null;
        }
        return (
          <section className="crmCard" key={item}>
            <header>
              <span className="crmDot" />
              <h2>{KIND_LABEL[item]}</h2>
              <span className="crmPill tone spacer">{inKind.length}</span>
            </header>
            <div className="crmPad" style={{ display: "grid", gap: 10 }}>
              {inKind.map((label) => (
                <div key={label.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <Chip label={label} />
                  <span className="crmRowDetail">
                    {label.memberCount} منتسبة
                    {label.managed ? " · بتحطها المنظومة لحالها" : ""}
                  </span>
                  {canEdit ? (
                    <span style={{ display: "flex", gap: 4, marginInlineStart: "auto" }}>
                      {LABEL_COLOURS.map((colour) => (
                        <button
                          aria-label={`لون ${colour}`}
                          className="swatch"
                          disabled={busy}
                          key={colour}
                          onClick={() => void recolour(label, colour)}
                          style={{ background: colour }}
                          type="button"
                        />
                      ))}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
