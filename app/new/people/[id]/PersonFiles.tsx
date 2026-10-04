"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { KIND_LABEL, type PersonFile, type PersonFileKind } from "@/app/lib/person-file-kinds";

const KINDS: PersonFileKind[] = ["plan", "test", "photo", "doc", "other"];

/**
 * The meal plan Afkar wrote for this member, the blood test she was sent, the
 * before photo. They belong to the person, not to a WhatsApp message — most
 * are made weeks before they are sent, and some are never sent through here.
 */
export function PersonFiles({ memberId, files }: { memberId: number; files: PersonFile[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<PersonFileKind>("plan");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    const picked = input.current?.files?.[0];

    if (!picked) {
      setError("اختاري ملف.");
      return;
    }

    setBusy(true);
    setError("");

    const body = new FormData();
    body.set("file", picked);
    body.set("kind", kind);
    body.set("label", label);

    const response = await fetch(`/api/people/${memberId}/files`, { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "الرفع فشل.");
      return;
    }

    setLabel("");
    if (input.current) {
      input.current.value = "";
    }
    router.refresh();
  }

  async function remove(file: PersonFile) {
    if (!confirm(`نمحي «${file.label}»؟`)) {
      return;
    }

    setBusy(true);
    const response = await fetch(`/api/people/files/${file.id}`, { method: "DELETE" });
    setBusy(false);

    if (!response.ok) {
      setError("المحو فشل.");
      return;
    }

    router.refresh();
  }

  return (
    <section className="crmCard">
      <header>
        <h2>ملفاتها</h2>
        <span className="crmPill spacer">{files.length}</span>
      </header>

      {files.length === 0 ? (
        <p className="crmEmpty">ولا ملف لهلق. المتكون، الفحوصات والصور بينحفظوا هون.</p>
      ) : (
        files.map((file) => (
          <div className="crmFile" key={file.id}>
            <span className="crmFileKind">{KIND_LABEL[file.kind]}</span>
            <span className="grow" style={{ flex: "999 1 220px", minWidth: 0 }}>
              <a href={file.url} rel="noreferrer" style={{ fontWeight: 600, fontSize: 14.5 }} target="_blank">
                {file.label}
              </a>
              <span className="crmRowDetail" style={{ display: "block" }}>
                {file.sizeLabel} · {file.uploadedAt.slice(0, 10)}
                {file.note ? ` · ${file.note}` : ""}
              </span>
            </span>
            <button className="crmBtn quiet danger" disabled={busy} onClick={() => remove(file)} type="button">
              امحي
            </button>
          </div>
        ))
      )}

      <form className="crmPad" onSubmit={upload} style={{ borderTop: "1px solid var(--line-soft)" }}>
        <div className="crmSearch">
          <label className="crmField" style={{ flex: "1 1 140px" }}>
            <span>النوع</span>
            <select onChange={(event) => setKind(event.target.value as PersonFileKind)} value={kind}>
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {KIND_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="crmField" style={{ flex: "999 1 200px" }}>
            <span>الاسم (اختياري)</span>
            <input
              onChange={(event) => setLabel(event.target.value)}
              placeholder="متكون أسبوع 1"
              type="text"
              value={label}
            />
          </label>
          <label className="crmField" style={{ flex: "1 1 200px" }}>
            <span>الملف</span>
            <input name="file" ref={input} type="file" />
          </label>
        </div>
        {error && (
          <p className="crmError" style={{ marginTop: 12 }}>
            {error}
          </p>
        )}
        <button className="crmBtn primary" disabled={busy} style={{ marginTop: 12 }} type="submit">
          {busy ? "عمّال يرفع…" : "ارفعي"}
        </button>
      </form>
    </section>
  );
}
