"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Her name and her number, corrected where they are read.
 *
 * The number is not a field: it is who she is on WhatsApp. The journey,
 * the group, every message and her registration all follow this record,
 * so correcting it here corrects it everywhere — which is the point.
 * Three women missed the first Clean message because their number was a
 * digit out and there was nowhere to fix it.
 */
export function PersonIdentity({
  canEdit,
  memberId,
  name,
  phone
}: {
  canEdit: boolean;
  memberId: number;
  name: string;
  phone: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftPhone, setDraftPhone] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true);
    setError("");
    const patch: Record<string, string> = {};
    if (draftName.trim() && draftName.trim() !== name) {
      patch.name = draftName.trim();
    }
    if (draftPhone.trim() && draftPhone.replace(/\D/g, "") !== phone.replace(/\D/g, "")) {
      patch.phone = draftPhone.trim();
    }
    if (!Object.keys(patch).length) {
      setBusy(false);
      setOpen(false);
      return;
    }

    const response = await fetch(`/api/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "تعذّر الحفظ.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!canEdit) {
    return null;
  }

  if (!open) {
    return (
      <button className="crmBtn quiet" onClick={() => setOpen(true)} type="button">
        تعديل
      </button>
    );
  }

  return (
    <div className="identityEdit">
      <label>
        الاسم
        <input onChange={(event) => setDraftName(event.target.value)} type="text" value={draftName} />
      </label>
      <label>
        رقم الهاتف
        <input
          className="crmLtr"
          inputMode="tel"
          onChange={(event) => setDraftPhone(event.target.value)}
          type="tel"
          value={draftPhone}
        />
      </label>
      <p className="crmNote">
        تغيير الرقم يغيّره في كل مكان: واتساب، المجموعة، المسار، واستمارتها.
      </p>
      {error && <p className="crmError">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="crmBtn" disabled={busy} onClick={save} type="button">
          {busy ? "…" : "حفظ"}
        </button>
        <button
          className="crmBtn quiet"
          disabled={busy}
          onClick={() => {
            setDraftName(name);
            setDraftPhone(phone);
            setError("");
            setOpen(false);
          }}
          type="button"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
