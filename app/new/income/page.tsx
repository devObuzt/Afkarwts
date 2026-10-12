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
import { incomeReport, incomeSeries, lastSync, type Bucket } from "@/app/lib/income/store";
import { day } from "../format";
import { IncomeFilters } from "../IncomeFilters";
import { readIncomeParams } from "../IncomeSummary";
import { IncomeChart } from "./IncomeChart";
import { SyncButton } from "./SyncButton";

export const dynamic = "force-dynamic";

const RANGES: Range[] = ["today", "week", "month", "last-month", "custom"];
const BUCKETS: Bucket[] = ["hour", "day", "week", "month"];
const BUCKET_LABEL: Record<Bucket, string> = {
  hour: "ساعات",
  day: "أيام",
  week: "أسابيع",
  month: "أشهر"
};

function shekels(amount: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(amount))} ش.ج`;
}

export default async function IncomePage({
  searchParams
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string; method?: string; by?: string }>;
}) {
  await requireUser("income.view");

  const params = await searchParams;
  const { range, from, to, method, by, hours, page } = readIncomeParams(params);

  const report = incomeReport({ from, to, method, page });

  // The pager keeps the filters: a link to page three of «this month, by
  // card» has to stay that view.
  const pageHref = (next: number) => {
    const search = new URLSearchParams();
    search.set("range", range);
    if (range === "custom") {
      search.set("from", from);
      search.set("to", to);
    }
    if (method) {
      search.set("method", String(method));
    }
    search.set("by", by);
    if (next > 1) {
      search.set("page", String(next));
    }
    return `/new/income?${search.toString()}`;
  };
  const sync = lastSync();

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>الدخل</h1>
        <p>
          الفواتير المقبوضة من Morning — {day(`${from}T00:00:00.000Z`)} إلى {day(`${to}T00:00:00.000Z`)}.
          {sync?.at ? ` آخر تحديث ${sync.at.slice(0, 16)}.` : " لم تُسحب بعد."}
        </p>
      </header>

      {/* The same three dropdowns the dashboard uses; the URL still carries
          the whole view, so it can be sent to somebody. */}
      <section className="crmCard crmPad">
        <IncomeFilters
          by={by}
          buckets={BUCKETS.filter((value) => value !== "hour" || hours).map((value) => ({
            value,
            label: BUCKET_LABEL[value]
          }))}
          from={from}
          method={method ? String(method) : ""}
          methods={[
            { value: "", label: "كل الوسائل" },
            ...Object.keys(METHOD_LABEL)
              .map(Number)
              .map((code) => ({ value: String(code), label: METHOD_LABEL[code] }))
          ]}
          range={range}
          ranges={RANGES.map((value) => ({ value, label: RANGE_LABEL[value] }))}
          to={to}
        />
      </section>

      <section className="crmGrid">
        <div className="crmCard crmTile crmPad" data-tone="forest" style={{ flex: "1 1 200px" }}>
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

      <section className="crmCard" data-tone="forest">
        <header>
          <span className="crmDot" />
          <h2>الدخل عبر الزمن</h2>
        </header>
        <div className="crmPad">
          {report.total.count === 0 ? (
            <p className="crmEmpty">لا بيانات في هذه المدة.</p>
          ) : (
            <>
              <IncomeChart points={incomeSeries(report, by)} />
              {by === "hour" && report.timed < report.total.count && (
                <p className="crmNote">
                  الساعة من وقت إصدار الفاتورة في Morning — مسجّلة على {report.timed} من{" "}
                  {report.total.count} فاتورة هنا. الأقدم منها لا تحمل ساعة فلا تظهر في الرسم.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <div className="crmSplit">
        <div className="main">
          <section className="crmCard" data-tone="olive">
            <header>
              <span className="crmDot" />
              <h2>الفواتير</h2>
              <span className="crmRowDetail">{report.paymentCount}</span>
              <SyncButton from={from} to={to} />
            </header>

            {report.payments.length === 0 ? (
              <p className="crmEmpty">
                لا فواتير في هذه المدة. إن كانت المدة صحيحة، اسحب من Morning أولاً.
              </p>
            ) : (
              report.payments.map((payment) => (
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

            {report.pages > 1 && (
              <div className="crmPager">
                <Link
                  aria-disabled={report.page <= 1}
                  className={report.page <= 1 ? "crmBtn quiet disabled" : "crmBtn quiet"}
                  href={pageHref(report.page - 1)}
                >
                  السابق
                </Link>
                <span className="crmRowDetail">
                  صفحة {report.page} من {report.pages} · {report.paymentCount} فاتورة
                </span>
                <Link
                  aria-disabled={report.page >= report.pages}
                  className={report.page >= report.pages ? "crmBtn quiet disabled" : "crmBtn quiet"}
                  href={pageHref(report.page + 1)}
                >
                  التالي
                </Link>
              </div>
            )}
          </section>
        </div>

        <div className="side">
          <section className="crmCard" data-tone="sage">
            <header>
              <span className="crmDot" />
              <h2>حسب المسار</h2>
            </header>
            {report.byPath.length === 0 ? (
              <p className="crmEmpty">لا مسار مسمّى في فواتير هذه المدة.</p>
            ) : (
              report.byPath.map((row) => (
                <div className="crmRow" key={row.item}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {/* «EXTRA+» printed as «+EXTRA»: a Latin run inside an
                          RTL line needs isolating or its sign moves. */}
                      <bdi>{row.item}</bdi>
                    </span>
                    <span className="crmRowDetail">{row.count} فاتورة</span>
                  </span>
                  <span className="crmRowTitle">{shekels(row.amount)}</span>
                </div>
              ))
            )}
          </section>

          {/* Shipping, a top-up, a photo day: sold beside a مسار, and they
              were being added up under its heading. */}
          <section className="crmCard" data-tone="olive">
            <header>
              <span className="crmDot" />
              <h2>الإضافات</h2>
            </header>
            {report.byExtra.length === 0 ? (
              <p className="crmEmpty">لا إضافات في هذه المدة.</p>
            ) : (
              report.byExtra.map((row) => (
                <div className="crmRow" key={row.item}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {/* «EXTRA+» printed as «+EXTRA»: a Latin run inside an
                          RTL line needs isolating or its sign moves. */}
                      <bdi>{row.item}</bdi>
                    </span>
                    <span className="crmRowDetail">{row.count} فاتورة</span>
                  </span>
                  <span className="crmRowTitle">{shekels(row.amount)}</span>
                </div>
              ))
            )}
          </section>

          <section className="crmCard" data-tone="clay">
            <header>
              <span className="crmDot" />
              <h2>لمن البيعة</h2>
            </header>
            {report.bySeller.map((row) => (
              <div className="crmRow" key={row.seller}>
                <span className="grow">
                  <span className="crmRowTitle" style={{ display: "block" }}>
                    {row.seller}
                  </span>
                  <span className="crmRowDetail">{row.count} فاتورة</span>
                </span>
                <span className="crmRowTitle">{shekels(row.amount)}</span>
              </div>
            ))}
            {report.bySeller.length <= 1 && (
              <div className="crmPad" style={{ borderTop: "1px solid var(--line-soft)" }}>
                <p className="crmNote">
                  كل فواتير Morning تصدر من حساب واحد، فلا شيء فيها يسمّي البائعة. تُفصل بإحدى طريقتين: حساب Morning
                  لكل واحدة من الفريق — عندها يظهر اسمها هنا من تلقائه — أو بإسناد المنتسب إلى مرافِقة في المنظومة.
                </p>
              </div>
            )}
          </section>

          <section className="crmCard" data-tone="clay">
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
