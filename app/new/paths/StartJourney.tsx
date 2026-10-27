"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Running a path on a group, from a date.
 *
 * The anchor is the group's own start date, not today: a cohort that
 * began on the 18th gets the schedule counted from the 18th even if it
 * is switched on later, so nobody is sent a «day one» message on day four.
 */
export function StartJourney({
  groups,
  paths
}: {
  groups: Array<{ id: number; name: string; memberCount: number }>;
  paths: Array<{ id: number; name: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState<number | "">("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [anchorDate, setAnchorDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId, groupId, anchorDate })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "ما زبطت.");
      return;
    }
    setOpen(false);
    setTemplateId("");
    setGroupId("");
    setAnchorDate("");
    router.refresh();
  }

  if (!open) {
    return (
      <button className="crmBtn" onClick={() => setOpen(true)} type="button">
        شغّلي مسار على مجموعة
      </button>
    );
  }

  return (
    <div className="crmPad" style={{ display: "grid", gap: 10 }}>
      <label>
        المسار
        <select
          onChange={(event) => setTemplateId(event.target.value ? Number(event.target.value) : "")}
          style={{ display: "block", width: "100%", marginTop: 4 }}
          value={templateId}
        >
          <option value="">اختاري…</option>
          {paths.map((path) => (
            <option key={path.id} value={path.id}>
              {path.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        المجموعة
        <select
          onChange={(event) => setGroupId(event.target.value ? Number(event.target.value) : "")}
          style={{ display: "block", width: "100%", marginTop: 4 }}
          value={groupId}
        >
          <option value="">اختاري…</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount})
            </option>
          ))}
        </select>
      </label>

      <label>
        تاريخ البداية
        <input
          onChange={(event) => setAnchorDate(event.target.value)}
          style={{ display: "block", marginTop: 4 }}
          type="date"
          value={anchorDate}
        />
        <span className="crmRowDetail" style={{ display: "block", marginTop: 4 }}>
          الجدول بينعدّ من هاد التاريخ — فمجموعة بلّشت قبل أيام بتاخد خطواتها بوقتها مش من اليوم.
        </span>
      </label>

      {error ? <p className="crmError">{error}</p> : null}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="crmBtn primary"
          disabled={busy || !templateId || !groupId || !anchorDate}
          onClick={() => void start()}
          type="button"
        >
          {busy ? "…" : "شغّلي"}
        </button>
        <button className="crmBtn" onClick={() => setOpen(false)} type="button">
          إلغاء
        </button>
      </div>
    </div>
  );
}
