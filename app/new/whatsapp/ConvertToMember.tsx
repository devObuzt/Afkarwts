"use client";

import { useEffect, useState } from "react";

type Product = { key: string; label: string; detail: string; kind: "path" | "addon" };
type Candidate = {
  id: number;
  number: string;
  paidOn: string;
  amount: number;
  methods: number[];
  clientName: string;
  clientPhone: string;
  matchedBy: "phone" | "name";
  takenBy: { id: number; name: string } | null;
};

const METHODS: Array<{ code: number; label: string }> = [
  { code: 1, label: "نقداً" },
  { code: 2, label: "شيك" },
  { code: 3, label: "بطاقة" },
  { code: 4, label: "حوالة" },
  { code: 5, label: "بِت / أبل پاي" }
];

/**
 * تحويل عضو نادي إلى منتسب — ثلاث خطوات بنافذة وحدة.
 *
 * الخطوات مرقّمة وبتنعرض وحدة وحدة: التحويل بيغيّر حالة إنسان وبيعلّق
 * عليه منتجات، وشاشة وحدة فيها كل الحقول بتخلّي الواحد يكبس «تم» بلا
 * ما يقرا.
 */
export function ConvertToMember({
  memberId,
  onClose,
  onDone
}: {
  memberId: number;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [hebrew, setHebrew] = useState("");
  const [phone, setPhone] = useState("");
  const [paid, setPaid] = useState<boolean | null>(null);
  const [method, setMethod] = useState<number | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [maySeeIncome, setMaySeeIncome] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/members/convert?memberId=${memberId}`);
      const payload = await response.json().catch(() => ({}));
      if (cancelled) {
        return;
      }
      if (!response.ok) {
        setError(payload.error ?? "ما قدرنا نفتح التحويل.");
      } else {
        setName(payload.member.name ?? "");
        setHebrew(payload.member.hebrewName ?? "");
        setPhone(payload.member.phone ?? "");
        setCandidates(payload.payments ?? []);
        setMaySeeIncome(payload.maySeeIncome !== false);
        setProducts(payload.products ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  async function submit() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/members/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, name, hebrewName: hebrew, paid, method, paymentId, products: picked })
    });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(payload.error ?? "ما زبط التحويل.");
      return;
    }
    await onDone();
    onClose();
  }

  return (
    <div className="cnvWrap" onClick={onClose} role="presentation">
      <div className="cnvBox" onClick={(event) => event.stopPropagation()} role="dialog">
        <header className="cnvHead">
          <strong>تحويل لمنتسب</strong>
          <span className="cnvSteps">
            {[1, 2, 3].map((n) => (
              <span className={n === step ? "on" : n < step ? "done" : ""} key={n} />
            ))}
          </span>
          <button aria-label="إغلاق" className="waClose" onClick={onClose} type="button">
            ×
          </button>
        </header>

        {loading ? (
          <p className="crmEmpty">بنحمّل…</p>
        ) : (
          <div className="cnvBody">
            {error ? <p className="crmError">{error}</p> : null}

            {/* ١ — الاسم */}
            {step === 1 && (
              <>
                <label className="crmField">
                  <span>الاسم بالعربي</span>
                  <input onChange={(event) => setName(event.target.value)} value={name} />
                </label>
                <label className="crmField">
                  <span>
                    بالعبري — مقترح آلياً، <strong>عدّليه إذا غلط</strong>
                  </span>
                  <input
                    dir="rtl"
                    onChange={(event) => setHebrew(event.target.value)}
                    placeholder="…"
                    value={hebrew}
                  />
                </label>
                <label className="crmField">
                  <span>رقم الهاتف</span>
                  <input className="crmLtr" onChange={(event) => setPhone(event.target.value)} readOnly value={phone} />
                </label>
                <div className="cnvActions">
                  <button className="crmBtn primary" disabled={!name.trim()} onClick={() => setStep(2)} type="button">
                    التالي — الدفع
                  </button>
                </div>
              </>
            )}

            {/* ٢ — الدفع */}
            {step === 2 && (
              <>
                <div className="cnvAsk">
                  <span>دَفَع؟</span>
                  <button
                    className={paid === true ? "crmBtn primary" : "crmBtn"}
                    onClick={() => setPaid(true)}
                    type="button"
                  >
                    آه
                  </button>
                  <button
                    className={paid === false ? "crmBtn primary" : "crmBtn"}
                    onClick={() => {
                      setPaid(false);
                      setMethod(null);
                      setPaymentId(null);
                    }}
                    type="button"
                  >
                    لسّه
                  </button>
                </div>

                {paid === true && (
                  <>
                    <label className="crmField">
                      <span>وسيلة الدفع</span>
                      <select
                        onChange={(event) => setMethod(Number(event.target.value) || null)}
                        value={method ?? ""}
                      >
                        <option value="">اختاري…</option>
                        {METHODS.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {/* احتمالات مش حكم: المطابقة بالاسم لحالها عملت 10
                        حسابات مكرّرة عند كو أكاديمي — الأدمن بيوثّق. */}
                    <div className="cnvMatch">
                      <span className="crmRowDetail">
                        {!maySeeIncome
                          ? "دفاتر مورنينج ما بتنعرض بصلاحيتك — سجّلي الوسيلة وبس، والربط بيعمله المالك."
                          : candidates.length
                            ? "دفعات من مورنينج ممكن تكون إلها — وثّقي وحدة:"
                            : "ما لقينا دفعة بمورنينج على هاد الرقم ولا الاسم."}
                      </span>
                      {candidates.map((item) => (
                        <button
                          className={paymentId === item.id ? "cnvPay on" : "cnvPay"}
                          key={item.id}
                          onClick={() => setPaymentId(paymentId === item.id ? null : item.id)}
                          type="button"
                        >
                          <span className="cnvPayTop">
                            <strong>{Math.round(item.amount)} ش.ج</strong>
                            <span className="crmLtr">{item.paidOn}</span>
                            <span className={item.matchedBy === "phone" ? "crmPill live" : "crmPill"}>
                              {item.matchedBy === "phone" ? "بالرقم" : "بالاسم"}
                            </span>
                          </span>
                          <span className="crmRowDetail">
                            {item.clientName} · <span className="crmLtr">{item.clientPhone}</span>
                            {item.takenBy ? ` · ⚠️ مربوطة بـ${item.takenBy.name}` : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <div className="cnvActions">
                  <button className="crmBtn quiet" onClick={() => setStep(1)} type="button">
                    رجوع
                  </button>
                  <button
                    className="crmBtn primary"
                    disabled={paid === null}
                    onClick={() => setStep(3)}
                    type="button"
                  >
                    التالي — المنتَج
                  </button>
                </div>
              </>
            )}

            {/* ٣ — المنتَج */}
            {step === 3 && (
              <>
                <p className="crmRowDetail" style={{ marginTop: 0 }}>
                  بينحفظ كملصق على المحادثة. بتقدري تختاري أكثر من واحد.
                </p>
                <div className="cnvProducts">
                  {products.map((product) => {
                    const on = picked.includes(product.key);
                    return (
                      <button
                        className={on ? "cnvProduct on" : "cnvProduct"}
                        key={product.key}
                        onClick={() =>
                          setPicked((current) =>
                            on ? current.filter((item) => item !== product.key) : [...current, product.key]
                          )
                        }
                        type="button"
                      >
                        <span className="cnvProductName">{product.label}</span>
                        <span className="cnvProductKind">{product.kind === "path" ? "مسار" : "إضافة"}</span>
                        <span className="cnvProductDetail">{product.detail}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="cnvActions">
                  <button className="crmBtn quiet" onClick={() => setStep(2)} type="button">
                    رجوع
                  </button>
                  <button
                    className="crmBtn primary"
                    disabled={busy || !picked.length}
                    onClick={() => void submit()}
                    type="button"
                  >
                    {busy ? "عم بنحوّل…" : "حوّليه لمنتسب"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
