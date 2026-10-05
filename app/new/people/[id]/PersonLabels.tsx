"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIND_LABEL, KIND_TONE, type LabelKind } from "@/app/lib/labels/kinds";

type Label = { id: number; name: string; kind: string; pinned?: boolean; managed?: string };

/**
 * The labels a person wears, the way Afkar reads them in her own chat list:
 * the مسار, the دفعة, the حالة, all at once rather than one group.
 */
export function PersonLabels({
  memberId,
  labels,
  all,
  coach,
  coaches,
  canEdit
}: {
  memberId: number;
  labels: Label[];
  all: Label[];
  coach: { id: number; name: string } | null;
  coaches: Array<{ id: number; name: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function change(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/people/${memberId}/labels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusy(false);
    router.refresh();
  }

  const worn = new Set(labels.map((label) => label.id));

  return (
    <section className="crmCard" data-tone="mint">
      <header>
        <span className="crmDot" />
        <h2>الملصقات</h2>
        {canEdit && (
          <button className="crmBtn quiet spacer" onClick={() => setOpen((value) => !value)} type="button">
            {open ? "إغلاق" : "تعديل"}
          </button>
        )}
      </header>

      <div className="crmPad">
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {labels.length === 0 && <span className="crmNote">لا توجد ملصقات.</span>}
          {labels.map((label) => (
            <span
              className="crmPill"
              data-tone={KIND_TONE[label.kind as LabelKind] ?? "salmon"}
              key={label.id}
              style={{ background: "var(--tone-wash)", color: "var(--tone-ink)" }}
              title={KIND_LABEL[label.kind as LabelKind] ?? ""}
            >
              {label.name}
            </span>
          ))}
        </div>

        <div className="crmFacts" style={{ marginTop: 16 }}>
          <dt>المرافِقة</dt>
          <dd>
            {canEdit ? (
              <select
                disabled={busy}
                onChange={(event) =>
                  change({ coachId: event.target.value ? Number(event.target.value) : null })
                }
                style={{ minHeight: 36, padding: "6px 10px", fontSize: 13.5 }}
                value={coach?.id ?? ""}
              >
                <option value="">بلا مرافِقة</option>
                {coaches.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            ) : (
              coach?.name ?? "بلا مرافِقة"
            )}
          </dd>
        </div>

        {open && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            {(["path", "batch", "state", "other"] as LabelKind[]).map((kind) => {
              const ofKind = all.filter((label) => label.kind === kind);
              if (!ofKind.length) {
                return null;
              }
              return (
                <div key={kind}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--faint)", marginBottom: 7 }}>
                    {KIND_LABEL[kind]}
                  </div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {ofKind.map((label) => (
                      <button
                        className={worn.has(label.id) ? "crmBtn quiet primary" : "crmBtn quiet"}
                        data-tone={KIND_TONE[kind]}
                        disabled={busy}
                        key={label.id}
                        onClick={() =>
                          change({ labelId: label.id, action: worn.has(label.id) ? "remove" : "add" })
                        }
                        type="button"
                      >
                        {label.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
