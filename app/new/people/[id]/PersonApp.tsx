"use client";

import { useCallback, useEffect, useState } from "react";

type Program = { key: string; name: string; length_days: number };
type Plan = { id: string; name: string; starts_on: string; length_days: number; status: string };
type View =
  | { state: "loading" }
  | { state: "off" }
  | { state: "error" }
  | {
      state: "ready";
      member: { id: string; first_login_at: string | null } | null;
      plans: Plan[];
      programs: Program[];
    };

const ERROR_TEXT: Record<string, string> = {
  NO_PHONE: "لا يوجد رقم هاتف — التطبيق يفتح الحساب من الرقم.",
  INVALID_PHONE: "رقم الهاتف غير صالح للتطبيق.",
  PERSON_CONFLICT: "الرقم مربوط بشخص آخر في التطبيق.",
  NO_APP_ACCOUNT: "لا حساب لها في التطبيق بعد — سجّليها بمسار أولاً.",
  UNREACHABLE: "التطبيق لا يرد الآن.",
  BAD_REQUEST: "التفاصيل ناقصة."
};

const PLAN_STATUS: Record<string, string> = { active: "فعّال", ended: "انتهى", cancelled: "ملغى" };

/** Today in Israel, as YYYY-MM-DD — a member's day starts in Israel, not in UTC. */
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

/** Her account in Afkar's member app: her tracks there, putting her on one, and a sign-in link. */
export function PersonApp({ memberId, name, phone, canEdit }: { memberId: number; name: string; phone: string; canEdit: boolean }) {
  const [view, setView] = useState<View>({ state: "loading" });
  const [programKey, setProgramKey] = useState("");
  const [startsOn, setStartsOn] = useState(today());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/people/${memberId}/app`, { cache: "no-store" }).catch(() => null);
    const body = response ? await response.json().catch(() => null) : null;
    if (!response || !body) return setView({ state: "error" });
    // Not configured, or not one of your people: no card at all rather than a misleading error.
    if (body.configured === false || response.status === 403) return setView({ state: "off" });
    if (!response.ok) return setView({ state: "error" });
    setView({ state: "ready", member: body.member, plans: body.plans, programs: body.programs });
    setProgramKey((current) => current || body.programs[0]?.key || "");
  }, [memberId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (view.state === "off") return null;

  async function enroll() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/people/${memberId}/app`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program_key: programKey, starts_on: startsOn })
    }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok) {
      setMessage({ ok: true, text: "سُجّلت — خطتها جاهزة في التطبيق." });
      await load();
    } else {
      setMessage({ ok: false, text: ERROR_TEXT[body.error] ?? "لم يتم التسجيل — حاولي مرة أخرى." });
    }
  }

  async function makeLink() {
    setBusy(true);
    setMessage(null);
    const response = await fetch(`/api/people/${memberId}/app/login-link`, { method: "POST" }).catch(() => null);
    const body = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response?.ok && body.url) setLink(body.url);
    else setMessage({ ok: false, text: ERROR_TEXT[body.error] ?? "لم يُنشأ الرابط — حاولي مرة أخرى." });
  }

  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const whatsapp = link
    ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `أهلا ${firstName}، أفكار جهّزتلك مسارك بالتطبيق. هاد رابط الدخول تبعك: ${link}`
      )}`
    : null;

  return (
    <section className="crmCard" data-tone="forest">
      <header>
        <span className="crmDot" />
        <h2>التطبيق</h2>
        {view.state === "ready" && view.member && (
          <span className={view.member.first_login_at ? "crmPill live spacer" : "crmPill spacer"}>
            {view.member.first_login_at ? "دخلت" : "لم تدخل بعد"}
          </span>
        )}
      </header>

      {view.state === "loading" && <p className="crmEmpty">جارٍ التحميل…</p>}
      {view.state === "error" && (
        <div className="crmPad">
          <p className="crmEmpty">التطبيق لا يرد الآن.</p>
          <button className="crmBtn quiet" onClick={() => void load()} type="button">
            حاولي مرة أخرى
          </button>
        </div>
      )}

      {view.state === "ready" && (
        <>
          {view.plans.length === 0 ? (
            <p className="crmEmpty">{view.member ? "لا مسار لها في التطبيق." : "لا حساب لها في التطبيق بعد."}</p>
          ) : (
            view.plans.map((plan) => (
              <div className="crmRow" key={plan.id}>
                <span className="grow">
                  <span className="crmRowTitle" style={{ display: "block" }}>
                    {plan.name}
                  </span>
                  <span className="crmRowDetail" style={{ display: "block" }}>
                    من {plan.starts_on} · {plan.length_days} يوم
                  </span>
                </span>
                <span className={plan.status === "active" ? "crmPill live" : "crmPill"}>
                  {PLAN_STATUS[plan.status] ?? plan.status}
                </span>
              </div>
            ))
          )}

          {canEdit && (
            <div className="crmPad" style={{ display: "grid", gap: 10 }}>
              {view.programs.length === 0 ? (
                <p className="crmEmpty">لا توجد مسارات في التطبيق بعد.</p>
              ) : (
                <>
                  <label className="crmField">
                    <span>المسار</span>
                    <select onChange={(event) => setProgramKey(event.target.value)} value={programKey}>
                      {view.programs.map((program) => (
                        <option key={program.key} value={program.key}>
                          {program.name} · {program.length_days} يوم
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="crmField">
                    <span>تاريخ البدء</span>
                    <input onChange={(event) => setStartsOn(event.target.value)} type="date" value={startsOn} />
                  </label>
                  <button
                    className="crmBtn primary"
                    disabled={busy || !programKey || !startsOn}
                    onClick={enroll}
                    type="button"
                  >
                    {busy ? "لحظة…" : "سجّليها بالمسار"}
                  </button>
                </>
              )}

              {view.member && (
                <button className="crmBtn quiet" disabled={busy} onClick={makeLink} type="button">
                  رابط دخول للتطبيق
                </button>
              )}

              {link && (
                <div style={{ display: "grid", gap: 8 }}>
                  <input dir="ltr" onFocus={(event) => event.target.select()} readOnly type="text" value={link} />
                  {whatsapp && (
                    <a className="crmBtn primary" href={whatsapp} rel="noreferrer" target="_blank">
                      إرسال بالواتساب
                    </a>
                  )}
                  <span className="crmRowDetail">الرابط يعمل مرة واحدة وينتهي بعد 24 ساعة.</span>
                </div>
              )}

              {message && <p className={message.ok ? "crmPill live" : "crmPill alert"}>{message.text}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
