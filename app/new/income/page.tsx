import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import {
  METHOD_LABEL,
  RANGE_LABEL,
  SOURCE_DETAIL,
  SOURCE_LABEL,
  SOURCE_TONE,
  methodName,
  type Range
} from "@/app/lib/income/kinds";
import { incomeReport, lastSync, rangeDates } from "@/app/lib/income/store";
import { day } from "../format";
import { SyncButton } from "./SyncButton";

export const dynamic = "force-dynamic";

const RANGES: Range[] = ["today", "week", "month", "last-month", "custom"];

function shekels(amount: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(amount))} ش.ج`;
}

export default async function IncomePage({
  searchParams
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; method?: string }>;
}) {
  await requireUser("income.view");

  const params = await searchParams;
  const range = (RANGES as string[]).includes(params.range ?? "") ? (params.range as Range) : "month";
  const { from, to } = rangeDates(range, new Date(), { from: params.from, to: params.to });
  const method = Number(params.method) || null;

  const report = incomeReport({ from, to, method });
  const sync = lastSync();

  const link = (next: { range?: Range; method?: number | null }) => {
    const search = new URLSearchParams();
    search.set("range", next.range ?? range);
    if ((next.range ?? range) === "custom") {
      search.set("from", from);
      search.set("to", to);
    }
    const chosen = next.method === undefined ? method : next.method;
    if (chosen) {
      search.set("method", String(chosen));
    }
    return `/new/income?${search.toString()}`;
  };

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>الدخل</h1>
        <p>
          الفواتير المقبوضة من Morning — {day(`${from}T00:00:00.000Z`)} إلى {day(`${to}T00:00:00.000Z`)}.
          {sync?.at ? ` آخر تحديث ${sync.at.slice(0, 16)}.` : " لم تُسحب بعد."}
        </p>
      </header>

      {/* Filters are links, so a view can be sent to someone. */}
      <section className="crmCard crmPad">
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {RANGES.map((option) => (
            <Link
              className={option === range ? "crmBtn quiet primary" : "crmBtn quiet"}
              href={link({ range: option })}
              key={option}
            >
              {RANGE_LABEL[option]}
            </Link>
          ))}
        </div>

        {range === "custom" && (
          <form className="crmSearch" method="get" style={{ marginTop: 12 }}>
            <input name="range" type="hidden" value="custom" />
            <label className="crmField" style={{ flex: "1 1 160px" }}>
              <span>من</span>
              <input defaultValue={from} name="from" style={{ direction: "ltr", textAlign: "right" }} type="date" />
            </label>
            <label className="crmField" style={{ flex: "1 1 160px" }}>
              <span>إلى</span>
              <input defaultValue={to} name="to" style={{ direction: "ltr", textAlign: "right" }} type="date" />
            </label>
            {method && <input name="method" type="hidden" value={method} />}
            <button className="crmBtn primary" style={{ alignSelf: "flex-end" }} type="submit">
              عرض
            </button>
          </form>
        )}

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 14 }}>
          <Link className={method ? "crmBtn quiet" : "crmBtn quiet primary"} href={link({ method: null })}>
            كل وسائل الدفع
          </Link>
          {Object.keys(METHOD_LABEL)
            .map(Number)
            .map((code) => (
              <Link
                className={method === code ? "crmBtn quiet primary" : "crmBtn quiet"}
                href={link({ method: code })}
                key={code}
              >
                {METHOD_LABEL[code]}
              </Link>
            ))}
        </div>
      </section>

      <section className="crmGrid">
        <div className="crmCard crmTile crmPad" data-tone="salmon" style={{ flex: "1 1 200px" }}>
          <div className="figure">{shekels(report.total.amount)}</div>
          <div className="crmRowDetail">
            المجموع · {report.total.count} فاتورة
            {report.linked < report.total.count && ` · ${report.linked} مرتبطة بمنتسب`}
          </div>
        </div>

        {report.bySource.map((row) => (
          <div
            className="crmCard crmTile crmPad"
            data-tone={SOURCE_TONE[row.source]}
            key={row.source}
            style={{ flex: "1 1 200px" }}
            title={SOURCE_DETAIL[row.source]}
          >
            <div className="figure">{shekels(row.amount)}</div>
            <div className="crmRowDetail">
              {SOURCE_LABEL[row.source]} · {row.count} فاتورة
            </div>
          </div>
        ))}
      </section>

      <div className="crmSplit">
        <div className="main">
          <section className="crmCard" data-tone="mint">
            <header>
              <span className="crmDot" />
              <h2>الفواتير</h2>
              <SyncButton from={from} to={to} />
            </header>

            {report.payments.length === 0 ? (
              <p className="crmEmpty">
                لا فواتير في هذه المدة. إن كانت المدة صحيحة، اسحب من Morning أولاً.
              </p>
            ) : (
              report.payments.slice(0, 120).map((payment) => (
                <div className="crmRow" key={payment.id}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {payment.memberId ? (
                        <Link href={`/new/people/${payment.memberId}`}>{payment.memberName}</Link>
                      ) : (
                        payment.clientName || "بلا اسم"
                      )}
                    </span>
                    <span className="crmRowDetail" style={{ display: "block" }}>
                      {day(`${payment.paidOn}T00:00:00.000Z`)} · {payment.methods.map(methodName).join("، ") || "—"}
                      {payment.items.length ? ` · ${payment.items.join("، ")}` : ""}
                      {payment.orderRef ? ` · طلب ${payment.orderRef}` : ""}
                      {!payment.memberId && payment.clientPhone ? " · غير مرتبط بمنتسب" : ""}
                    </span>
                  </span>
                  <span className="crmPill" data-tone={SOURCE_TONE[payment.source]}>
                    {SOURCE_LABEL[payment.source]}
                  </span>
                  <span className="crmRowTitle" style={{ whiteSpace: "nowrap" }}>
                    {shekels(payment.amount)}
                  </span>
                </div>
              ))
            )}
          </section>
        </div>

        <div className="side">
          <section className="crmCard" data-tone="apricot">
            <header>
              <span className="crmDot" />
              <h2>حسب المسار</h2>
            </header>
            {report.byItem.length === 0 ? (
              <p className="crmEmpty">لا بنود مسمّاة.</p>
            ) : (
              report.byItem.slice(0, 12).map((row) => (
                <div className="crmRow" key={row.item}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {row.item}
                    </span>
                    <span className="crmRowDetail">{row.count} فاتورة</span>
                  </span>
                  <span className="crmRowTitle">{shekels(row.amount)}</span>
                </div>
              ))
            )}
          </section>

          <section className="crmCard" data-tone="mauve">
            <header>
              <span className="crmDot" />
              <h2>حسب وسيلة الدفع</h2>
            </header>
            {report.byMethod.length === 0 ? (
              <p className="crmEmpty">لا مدفوعات.</p>
            ) : (
              report.byMethod.map((row) => (
                <div className="crmRow" key={row.method}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {methodName(row.method)}
                    </span>
                    <span className="crmRowDetail">{row.count} فاتورة</span>
                  </span>
                  <span className="crmRowTitle">{shekels(row.amount)}</span>
                </div>
              ))
            )}
          </section>

          <div className="crmCard crmPad">
            <p className="crmNote">
              المصدر يقرره المتجر: فاتورة تحمل رقم طلب، أو رقم هاتف طلب من المتجر، تُحسب على الموقع. وما عداها بيع
              مباشر. Morning وحده لا يفرّق — كل فواتيره من حساب واحد.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
