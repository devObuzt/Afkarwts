"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Option = { value: string; label: string };

/**
 * The income filters, as three dropdowns.
 *
 * They were eighteen link-buttons across two rows — five ranges, six
 * payment methods, three buckets — which on the dashboard is more chrome
 * than figures. A dropdown says the same thing in one line, and the URL
 * still carries the whole view so it can be sent to somebody.
 */
export function IncomeFilters({
  ranges,
  methods,
  buckets,
  range,
  method,
  by,
  from,
  to,
  hourly
}: {
  ranges: Option[];
  methods: Option[];
  buckets: Option[];
  range: string;
  method: string;
  by: string;
  from: string;
  to: string;
  /** Whether the range on screen is short enough for hours already. */
  hourly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }

    // A custom range needs its two dates carried, or the page falls back
    // to the month and the dates the user picked disappear.
    if (key === "range" && value !== "custom") {
      next.delete("from");
      next.delete("to");
    }

    // Hours only mean something over a day or two. Rather than hiding the
    // option until «اليوم» is picked — which made it look as though the
    // income screen had no hour view at all — choosing it moves the range
    // to today, which is the only range it could have meant.
    if (key === "by" && value === "hour" && !hourly) {
      next.set("range", "today");
      next.delete("from");
      next.delete("to");
    }

    if (next.get("range") === "custom") {
      next.set("from", from);
      next.set("to", to);
    }

    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="crmFilters" data-pending={pending ? "yes" : "no"}>
      <label>
        <span>المدة</span>
        <select onChange={(event) => set("range", event.target.value)} value={range}>
          {ranges.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>الدفع</span>
        <select onChange={(event) => set("method", event.target.value)} value={method}>
          {methods.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>الرسم</span>
        <select onChange={(event) => set("by", event.target.value)} value={by}>
          {buckets.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {range === "custom" && (
        <>
          <label>
            <span>من</span>
            <input
              onChange={(event) => set("from", event.target.value)}
              style={{ direction: "ltr" }}
              type="date"
              value={from}
            />
          </label>
          <label>
            <span>إلى</span>
            <input
              onChange={(event) => set("to", event.target.value)}
              style={{ direction: "ltr" }}
              type="date"
              value={to}
            />
          </label>
        </>
      )}
    </div>
  );
}
