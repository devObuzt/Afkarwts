"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AppProductRequest, AppReview } from "@/app/lib/afkar-app/queues";

type Review = AppReview & { personId: string | null };

const ERROR_TEXT: Record<string, string> = {
  NAME: "اكتبي اسم المنتج.",
  VALUES: "القيم غير معقولة لـ100 غرام — راجعيها.",
  PORTION: "الحصة تحتاج اسماً ووزناً (حتى 2000 غ)، أو اتركيهما فارغين.",
  NOT_FOUND: "الطلب أُغلق من قبل.",
  BAD_REQUEST: "التفاصيل ناقصة."
};
const errorText = (code: string) => ERROR_TEXT[code] ?? "التطبيق لا يرد الآن.";

function when(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date(iso))
    .replace(",", "");
}

async function post(path: string, body?: unknown): Promise<string | null> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).catch(() => null);
  if (!response) return "UNREACHABLE";
  if (response.ok) return null;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error ?? "ERROR";
}

/** «ابعثيها لأفكار»: the photo, her note, and two answers — each answer reaches her as a notification. */
export function ReviewQueue({ reviews, canEdit }: { reviews: Review[]; canEdit: boolean }) {
  return (
    <section className="crmCard" data-tone="forest">
      <header>
        <span className="crmDot" />
        <h2>صور من المنتسبات</h2>
        <span className="crmPill tone spacer">{reviews.length}</span>
      </header>
      {reviews.length === 0 ? (
        <p className="crmEmpty">لا صور تنتظر.</p>
      ) : (
        reviews.map((review) => <ReviewItem canEdit={canEdit} key={review.id} review={review} />)
      )}
    </section>
  );
}

function ReviewItem({ review, canEdit }: { review: Review; canEdit: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(outcome: "added" | "not_added") {
    setBusy(true);
    setError(null);
    const failed = await post(`/api/app-queues/reviews/${review.id}/resolve`, { outcome, message });
    setBusy(false);
    if (failed) return setError(errorText(failed));
    router.refresh();
  }

  return (
    <div className="crmPad" style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line, rgba(0,0,0,.08))" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <a href={`/api/app-queues/reviews/${review.id}/image`} rel="noreferrer" target="_blank">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind our own route, not an optimisable asset */}
          <img
            alt={`صورة وجبة من ${review.member.display_name}`}
            loading="lazy"
            src={`/api/app-queues/reviews/${review.id}/image`}
            style={{ width: 160, height: 160, objectFit: "cover", borderRadius: 12, display: "block" }}
          />
        </a>
        <div style={{ flex: 1, minWidth: 200, display: "grid", gap: 4 }}>
          <span className="crmRowTitle">
            {review.personId ? <Link href={`/new/people/${review.personId}`}>{review.member.display_name}</Link> : review.member.display_name}
          </span>
          <span className="crmRowDetail" dir="ltr" style={{ textAlign: "right" }}>
            {when(review.at)}
          </span>
          <p style={{ margin: 0 }}>{review.note || "بلا ملاحظة."}</p>
        </div>
      </div>
      {canEdit && (
        <>
          <label className="crmField">
            <span>رسالة لها (اختياري — بدونها تصلها رسالة جاهزة)</span>
            <input maxLength={300} onChange={(event) => setMessage(event.target.value)} placeholder="مثلاً: ضفت «مقلوبة دجاج» — حصة صحن وسط" value={message} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="crmBtn primary" disabled={busy} onClick={() => void resolve("added")} type="button">
              أضفتها للمكتبة
            </button>
            <button className="crmBtn quiet" disabled={busy} onClick={() => void resolve("not_added")} type="button">
              لم أضفها
            </button>
          </div>
          {error && <p className="crmEmpty">{error}</p>}
        </>
      )}
    </div>
  );
}

/** Products scanned that nobody knows yet: Afkar checks the values before every member can use them. */
export function ProductQueue({ products, canEdit }: { products: AppProductRequest[]; canEdit: boolean }) {
  return (
    <section className="crmCard" data-tone="sage">
      <header>
        <span className="crmDot" />
        <h2>منتجات جديدة بالباركود</h2>
        <span className="crmPill tone spacer">{products.length}</span>
      </header>
      {products.length === 0 ? (
        <p className="crmEmpty">لا منتجات تنتظر.</p>
      ) : (
        products.map((product) => <ProductItem canEdit={canEdit} key={product.id} product={product} />)
      )}
    </section>
  );
}

const SOURCE: Record<string, string> = { openfoodfacts: "من Open Food Facts", label_ocr: "مقروء من صورة الملصق" };

function ProductItem({ product, canEdit }: { product: AppProductRequest; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: product.name,
    kcal: String(product.per100.kcal),
    protein: String(product.per100.protein),
    carb: String(product.per100.carb),
    fat: String(product.per100.fat),
    portionLabel: "",
    portionGrams: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  async function act(kind: "approve" | "reject") {
    setBusy(true);
    setError(null);
    const failed = await post(`/api/app-queues/products/${product.id}/${kind}`, kind === "approve" ? form : undefined);
    setBusy(false);
    if (failed) return setError(errorText(failed));
    router.refresh();
  }

  const numberField = (key: "kcal" | "protein" | "carb" | "fat", label: string) => (
    <label className="crmField" style={{ width: 110 }}>
      <span>{label}</span>
      <input disabled={!canEdit} inputMode="decimal" onChange={set(key)} value={form[key]} />
    </label>
  );

  return (
    <div className="crmPad" style={{ display: "grid", gap: 10, borderTop: "1px solid var(--line, rgba(0,0,0,.08))" }}>
      <span className="crmRowDetail">
        <span dir="ltr">{product.barcode}</span> · {SOURCE[product.source] ?? product.source} · <span dir="ltr">{when(product.at)}</span>
      </span>
      <label className="crmField">
        <span>الاسم كما يظهر للمنتسبات</span>
        <input disabled={!canEdit} onChange={set("name")} value={form.name} />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {numberField("kcal", "سعرات / 100غ")}
        {numberField("protein", "بروتين غ")}
        {numberField("carb", "كربوهيدرات غ")}
        {numberField("fat", "دهون غ")}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="crmField" style={{ flex: 1, minWidth: 160 }}>
          <span>حصة بيتية (اختياري)</span>
          <input disabled={!canEdit} onChange={set("portionLabel")} placeholder="مثلاً: معلقة · علبة · حبة" value={form.portionLabel} />
        </label>
        <label className="crmField" style={{ width: 110 }}>
          <span>وزنها غ</span>
          <input disabled={!canEdit} inputMode="decimal" onChange={set("portionGrams")} value={form.portionGrams} />
        </label>
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="crmBtn primary" disabled={busy} onClick={() => void act("approve")} type="button">
            أضيفيه للمكتبة
          </button>
          <button className="crmBtn quiet" disabled={busy} onClick={() => void act("reject")} type="button">
            ليس للمكتبة
          </button>
        </div>
      )}
      {error && <p className="crmEmpty">{error}</p>}
    </div>
  );
}
