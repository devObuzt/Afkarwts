"use client";

import { FormEvent, useState } from "react";
import type { Field } from "@/app/lib/forms/store";

/**
 * Most people open this on a phone, with one hand, in Arabic. One question per
 * row, large targets, and the server's own words when something is missing —
 * the browser checks nothing the server does not check again.
 */
export function FormClient({
  fields,
  intro,
  name,
  token
}: {
  fields: Field[];
  intro: string;
  name: string;
  token: string;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function set(id: number, value: string) {
    setAnswers((current) => ({ ...current, [String(id)]: value }));
  }

  function toggleMulti(id: number, option: string, checked: boolean) {
    const chosen = (answers[String(id)] ?? "").split("، ").filter(Boolean);
    const next = checked ? [...chosen, option] : chosen.filter((item) => item !== option);
    set(id, next.join("، "));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      const response = await fetch(`/api/f/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "ما قدرنا نستقبل التسجيل. جرّب مرة ثانية.");
        setBusy(false);
        return;
      }

      setDone(true);
    } catch {
      setError("ما في اتصال. تأكد من الإنترنت وجرّب مرة ثانية.");
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="formPage">
        <section className="formCard">
          <h1>وصلنا تسجيلك ✅</h1>
          <p className="formNote">
            شكراً إلك. رح نراجع التفاصيل ونتواصل معك قريباً على نفس الرقم اللي كتبته.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="formPage">
      <form className="formCard" onSubmit={submit}>
        <h1>{name}</h1>
        {intro ? <p className="formIntro">{intro}</p> : null}

        {fields.map((field) => (
          <div className="formField" key={field.id}>
            <label htmlFor={`f${field.id}`}>
              {field.label}
              {field.required ? <span aria-hidden className="req"> *</span> : null}
            </label>
            {field.help ? <p className="formHelp">{field.help}</p> : null}

            {field.kind === "textarea" ? (
              <textarea
                id={`f${field.id}`}
                onChange={(event) => set(field.id, event.target.value)}
                rows={3}
                value={answers[String(field.id)] ?? ""}
              />
            ) : null}

            {field.kind === "text" || field.kind === "phone" ? (
              <input
                id={`f${field.id}`}
                inputMode={field.kind === "phone" ? "tel" : "text"}
                onChange={(event) => set(field.id, event.target.value)}
                placeholder={field.kind === "phone" ? "05X-XXX-XXXX" : ""}
                type={field.kind === "phone" ? "tel" : "text"}
                value={answers[String(field.id)] ?? ""}
              />
            ) : null}

            {field.kind === "date" ? (
              <input
                id={`f${field.id}`}
                onChange={(event) => set(field.id, event.target.value)}
                type="date"
                value={answers[String(field.id)] ?? ""}
              />
            ) : null}

            {field.kind === "choice" ? (
              <div className="formOptions">
                {field.options.map((option) => (
                  <label className="formOption" key={option}>
                    <input
                      checked={(answers[String(field.id)] ?? "") === option}
                      name={`f${field.id}`}
                      onChange={() => set(field.id, option)}
                      type="radio"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : null}

            {field.kind === "multi" ? (
              <div className="formOptions">
                {field.options.map((option) => (
                  <label className="formOption" key={option}>
                    <input
                      checked={(answers[String(field.id)] ?? "").split("، ").includes(option)}
                      onChange={(event) => toggleMulti(field.id, option, event.target.checked)}
                      type="checkbox"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : null}

            {field.kind === "consent" ? (
              <label className="formOption consent">
                <input
                  checked={Boolean(answers[String(field.id)])}
                  onChange={(event) => set(field.id, event.target.checked ? field.options[0] ?? "موافق/ة" : "")}
                  type="checkbox"
                />
                <span>{field.options[0] ?? "موافق/ة"}</span>
              </label>
            ) : null}
          </div>
        ))}

        {error ? <p className="formError">{error}</p> : null}

        <button className="formSubmit" disabled={busy} type="submit">
          {busy ? "عم نبعت…" : "إرسال التسجيل"}
        </button>
      </form>
    </main>
  );
}
