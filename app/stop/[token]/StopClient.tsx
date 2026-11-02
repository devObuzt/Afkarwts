"use client";

import { useState } from "react";

type State = "idle" | "working" | "stopped" | "resumed" | "error";

export function StopClient({
  token,
  masked,
  alreadyStopped
}: {
  token: string;
  masked: string;
  alreadyStopped: boolean;
}) {
  const [state, setState] = useState<State>(alreadyStopped ? "stopped" : "idle");
  const [error, setError] = useState("");

  async function act(action: "stop" | "resume") {
    setState("working");
    setError("");
    try {
      const response = await fetch("/api/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action })
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "تعذّر تنفيذ الطلب.");
      }
      setState(action === "stop" ? "stopped" : "resumed");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذّر تنفيذ الطلب.");
      setState("error");
    }
  }

  if (state === "stopped") {
    return (
      <main className="formPage" dir="rtl" lang="ar">
        <section className="formCard">
          <h1>تم إيقاف الرسائل ✅</h1>
          <p className="formNote">
            ما رح يوصل الرقم <strong>{masked}</strong> أي رسالة عروض أو حملات من Afkar.
          </p>
          <p className="formNote">
            إذا كنتي مشتركة بمسار، رسائل برنامجك بتضل توصلك — هاي مش عروض.
          </p>
          <button className="formSubmit" type="button" onClick={() => act("resume")}>
            غلط؟ رجّعوا الرسائل
          </button>
        </section>
      </main>
    );
  }

  if (state === "resumed") {
    return (
      <main className="formPage" dir="rtl" lang="ar">
        <section className="formCard">
          <h1>رجعت الرسائل</h1>
          <p className="formNote">
            الرقم <strong>{masked}</strong> رجع يستلم عروض Afkar. وبتقدري توقفيها من نفس هذا الرابط أي وقت.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="formPage" dir="rtl" lang="ar">
      <section className="formCard">
        <h1>إيقاف الرسائل</h1>
        <p className="formNote">
          بتقدري توقفي رسائل العروض والحملات عن الرقم <strong>{masked}</strong>. ما بينمحي إشي من حسابك، وبتقدري
          ترجعي أي وقت.
        </p>
        <button className="formSubmit" type="button" onClick={() => act("stop")} disabled={state === "working"}>
          {state === "working" ? "لحظة…" : "أوقفوا رسائل العروض"}
        </button>
        {error ? (
          <p className="formNote" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
