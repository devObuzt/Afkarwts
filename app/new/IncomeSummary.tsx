import Link from "next/link";
import {
  METHOD_LABEL,
  RANGE_LABEL,
  SOURCE_DETAIL,
  SOURCE_LABEL,
  SOURCE_TONE,
  type Range
} from "@/app/lib/income/kinds";
import { hourBucketAllowed, incomeReport, incomeSeries, rangeDates, type Bucket } from "@/app/lib/income/store";
import { IncomeChart } from "./income/IncomeChart";
import { IncomeFilters } from "./IncomeFilters";

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

/** The filters the dashboard and the income screen both read. */
export function readIncomeParams(params: {
  range?: string;
  from?: string;
  to?: string;
  method?: string;
  by?: string;
  page?: string;
}) {
  const range = (RANGES as string[]).includes(params.range ?? "") ? (params.range as Range) : "month";
  const { from, to } = rangeDates(range, new Date(), { from: params.from, to: params.to });
  const method = Number(params.method) || null;

  // Hours are offered only for a day or two. Eighteen months of them is
  // thirteen thousand columns, which is not a chart.
  const hours = hourBucketAllowed(from, to);
  const asked = (BUCKETS as string[]).includes(params.by ?? "") ? (params.by as Bucket) : null;
  const fallback: Bucket = range === "today" ? "hour" : range === "custom" ? "month" : "day";
  const wanted = asked ?? fallback;
  const by: Bucket = wanted === "hour" && !hours ? "day" : wanted;

  const page = Math.max(1, Math.trunc(Number(params.page) || 1));
  return { range, from, to, method, by, hours, page };
}

/**
 * The money, on the page Afkar opens on.
 *
 * It is the filter, the figures and the chart — the three things Wisam
 * asked to see here. The invoice list, the breakdown by مسار and the rest
 * stay on /new/income, because a dashboard that holds everything is a
 * second screen rather than a summary.
 */
export function IncomeSummary({
  params
}: {
  params: { range?: string; from?: string; to?: string; method?: string; by?: string };
}) {
  const { range, from, to, method, by, hours } = readIncomeParams(params);
  const report = incomeReport({ from, to, method });

  return (
    <section className="crmCard" data-tone="forest">
      <header>
        <span className="crmDot" />
        <h2>الدخل</h2>
        <Link className="spacer" href={`/new/income?range=${range}${method ? `&method=${method}` : ""}`} style={{ fontSize: 13.5 }}>
          كل الفواتير ←
        </Link>
      </header>

      <div className="crmPad">
        <IncomeFilters
          by={by}
          buckets={BUCKETS.map((value) => ({ value, label: BUCKET_LABEL[value] }))}
          from={from}
          hourly={hours}
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

        {/* Four readings, small: the figure is what is read, not the box. */}
        <div className="crmStats">
          <div className="crmStat" data-tone="forest">
            <span className="statFigure">{shekels(report.total.amount)}</span>
            <span className="statName">المجموع · {report.total.count} فاتورة</span>
          </div>
          {report.bySource.map((row) => (
            <div className="crmStat" data-tone={SOURCE_TONE[row.source]} key={row.source} title={SOURCE_DETAIL[row.source]}>
              <span className="statFigure">{shekels(row.amount)}</span>
              <span className="statName">
                {SOURCE_LABEL[row.source]} · {row.count}
              </span>
            </div>
          ))}
        </div>

        {report.total.count === 0 ? (
          <p className="crmEmpty">لا مدفوعات في هذه المدة.</p>
        ) : (
          <>
            <IncomeChart points={incomeSeries(report, by)} />
            {by === "hour" && report.timed < report.total.count && (
              <p className="crmNote">
                الساعة تُقرأ من وقت إصدار الفاتورة في Morning، وهي مسجّلة على {report.timed} من{" "}
                {report.total.count} فاتورة في هذه المدة. الفواتير الأقدم من تشغيل هذه الميزة لا
                تحمل ساعة، فلا تظهر في الرسم.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
