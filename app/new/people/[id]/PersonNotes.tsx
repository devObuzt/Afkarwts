"use client";

import { useState } from "react";

/** What Afkar learned about this member that no form asked her. */
export function PersonNotes({ memberId, notes }: { memberId: number; notes: string }) {
  const [text, setText] = useState(notes);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  async function save() {
    setState("saving");
    const response = await fetch(`/api/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: text })
    });
    setState(response.ok ? "saved" : "failed");
  }

  return (
    <section className="crmCard" data-tone="mint">
      <header>
        <span className="crmDot" />
        <h2>ملاحظات</h2>
        {state === "saved" && <span className="crmPill live spacer">حُفظت</span>}
        {state === "failed" && <span className="crmPill alert spacer">ما حُفظت</span>}
      </header>
      <div className="crmPad">
        <textarea
          onChange={(event) => {
            setText(event.target.value);
            setState("idle");
          }}
          placeholder="حساسية من المكسرات · تعمل ليلاً، فالصباح غير مناسب لها"
          value={text}
        />
        <button
          className="crmBtn primary"
          disabled={state === "saving" || text === notes}
          onClick={save}
          style={{ marginTop: 12 }}
          type="button"
        >
          {state === "saving" ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </section>
  );
}
