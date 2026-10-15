"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Erasing a registration, in two steps on purpose.
 *
 * The table is 235 rows of small controls and a delete that fires on one
 * click is a delete that fires on a misclick. So the button only opens a
 * question, and the question names the woman and says what will happen to
 * her place in the cohort — because «حذف» on a crowded row tells you
 * nothing about what you are about to lose.
 */
export function DeleteMark({
  city,
  inGroup,
  name,
  phone,
  submissionId
}: {
  city: string;
  inGroup: boolean;
  name: string;
  phone: string;
  submissionId: number;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Esc closes it. A dialog with only a mouse way out is a dialog people
  // click through to be rid of.
  useEffect(() => {
    if (!asking) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAsking(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  async function remove() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/forms/submissions/${submissionId}`, { method: "DELETE" });
    setBusy(false);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.error ?? "تعذّر الحذف.");
      return;
    }
    setAsking(false);
    router.refresh();
  }

  return (
    <>
      <button className="crmBtn quiet" onClick={() => setAsking(true)} title="حذف هذا التسجيل نهائياً" type="button">
        حذف
      </button>

      {asking && (
        <div className="crmModalWrap" onClick={() => !busy && setAsking(false)} role="presentation">
          <div
            aria-modal="true"
            className="crmModal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h3>حذف هذا التسجيل نهائياً؟</h3>
            <p className="crmModalWho">
              <strong>{name || "بلا اسم"}</strong>
              {city ? ` · ${city}` : ""}
              {phone ? (
                <>
                  {" · "}
                  <span className="crmLtr">{phone}</span>
                </>
              ) : null}
            </p>
            <ul className="crmModalList">
              <li>يُمحى التسجيل وكل إجاباته — لا يمكن التراجع.</li>
              {inGroup && <li>وتخرج من مجموعة المسار، فتتوقف رسائل المسار عنها.</li>}
              <li>يبقى ملفها كمنتسبة ومحادثاتها كما هي. حذفها بالكامل من صفحتها.</li>
            </ul>
            <p className="crmNote">
              إن كان القصد إخراجها من هذه الدفعة فقط، «ارفض» أفضل: يُخفي التسجيل ويمكن إرجاعه.
            </p>
            {error && <p className="crmError">{error}</p>}
            <div className="crmModalRow">
              <button className="crmBtn danger" disabled={busy} onClick={remove} type="button">
                {busy ? "…" : "نعم، احذف نهائياً"}
              </button>
              <button className="crmBtn quiet" disabled={busy} onClick={() => setAsking(false)} type="button">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
