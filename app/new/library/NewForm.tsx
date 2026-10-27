"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Starting next cohort's registration link.
 *
 * It was the one step that still needed the old English screen: everything
 * after it — the questions, the title, closing it, the report — already
 * lives here.
 *
 * The new form starts from Afkar's Clean questions rather than empty,
 * because a cohort's form is last cohort's form with a few answers
 * changed, and an empty one is twenty questions of typing.
 */
export function NewForm({ groups }: { groups: Array<{ id: number; name: string; memberCount: number }> }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), groupId: Number(groupId), fromTemplate: true })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(payload.error ?? "ما قدرنا نعمل الاستمارة.");
      return;
    }

    // Straight into its questions: a form nobody edited is last cohort's
    // form under this cohort's name.
    router.push(`/new/forms/${payload.form.id}/edit`);
  }

  return (
    <div className="crmPad crmFilters">
      <label className="crmField">
        <span>اسم الاستمارة — إلنا، ما بيشوفه حدا</span>
        <input
          onChange={(event) => setName(event.target.value)}
          placeholder="CLEAN 25.11"
          value={name}
        />
      </label>
      <label className="crmField">
        <span>بتسجّل بمجموعة</span>
        <select onChange={(event) => setGroupId(event.target.value)} value={groupId}>
          <option value="">اختاري المجموعة…</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.memberCount})
            </option>
          ))}
        </select>
      </label>
      <button
        className="crmBtn primary"
        disabled={busy || !name.trim() || !groupId}
        onClick={() => void create()}
        type="button"
      >
        {busy ? "عم بنعملها…" : "استمارة جديدة"}
      </button>
      <span className="crmNote" style={{ alignSelf: "center" }}>
        بتبلّش من أسئلة كلين، وبتعدّليها لكل دفعة.
      </span>
      {error ? <span className="crmError">{error}</span> : null}
    </div>
  );
}
