"use client";

import { useState } from "react";

/**
 * A real file, not a page that explains how to make one.
 *
 * The server renders it with a browser, which takes a few seconds for a
 * wide table — so the button says so, and falls back to the print sheet
 * if the service has no browser to render with.
 */
export function PdfButton({ formId, state, printHref }: { formId: number; state: string; printHref: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setBusy(true);
    setError("");

    const response = await fetch(`/api/forms/${formId}/pdf${state ? `?state=${state}` : ""}`);

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setBusy(false);
      setError(payload.error ?? "تعذّر توليد الملف.");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `registrations-${formId}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setBusy(false);
  }

  return (
    <>
      <button className="crmBtn primary" disabled={busy} onClick={download} type="button">
        {busy ? "جارٍ التجهيز…" : "تنزيل PDF"}
      </button>
      {error && (
        <span style={{ flexBasis: "100%", marginTop: 8 }}>
          <p className="crmError">
            {error}{" "}
            <a href={printHref} rel="noreferrer" target="_blank">
              نسخة للطباعة
            </a>
          </p>
        </span>
      )}
    </>
  );
}
