"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Finding one woman in 235 rows.
 *
 * It searches the whole row — name, town, phone, and every answer — because
 * «أي إشي» is what was asked for and because the thing you remember about
 * a registration is rarely the field it lives in. The typing settles before
 * it asks the server, so a name is one request and not seven.
 */
export function SearchBox({ formId, state, value }: { formId: number; state: string; value: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(value);
  const typed = useRef(false);

  // A change that came from the URL (the state tabs, the back button) is not
  // the user typing, and must not be echoed back as a fresh search.
  useEffect(() => {
    setText(value);
    typed.current = false;
  }, [value]);

  useEffect(() => {
    if (!typed.current || text === value) {
      return;
    }
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (text.trim()) next.set("q", text.trim());
      else next.delete("q");
      router.replace(`/new/forms/${formId}/report?${next.toString()}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [text, value, params, router, formId]);

  return (
    <span className="crmFind">
      <input
        aria-label="ابحث في الجدول"
        className="crmInput"
        inputMode="search"
        onChange={(event) => {
          typed.current = true;
          setText(event.target.value);
        }}
        placeholder="ابحث باسم أو رقم أو أي إجابة…"
        type="search"
        value={text}
      />
      {value && (
        <a className="crmBtn quiet" href={`/new/forms/${formId}/report${state ? `?state=${state}` : ""}`}>
          مسح
        </a>
      )}
    </span>
  );
}
