import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

function doc(over: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  return {
    morningId: `h${seq}`,
    number: String(3000 + seq),
    docType: 320,
    paidOn: "2026-10-12",
    issuedAt: 0,
    amount: 100,
    currency: "ILS",
    methods: [3],
    clientName: "ليلى",
    clientPhone: "",
    items: [],
    description: "",
    orderRef: "",
    url: "",
    soldBy: "",
    ...over
  } as never;
}

test("the hour is Afkar's, not the container's", async () => {
  const { jerusalemHour } = await import("@/app/lib/income/store");

  // 1791822468 is 16:27 UTC. The service runs with TZ unset, so a plain
  // Date would call this 16:00 and put an evening sale in the afternoon.
  assert.equal(jerusalemHour(1791822468), "2026-10-12T19");
  assert.equal(jerusalemHour(1791813897), "2026-10-12T17");

  // And winter, when the offset is +2 rather than +3: 2026-01-15 22:30 UTC
  // is half past midnight on the 16th in Jerusalem — a different day.
  assert.equal(jerusalemHour(Date.UTC(2026, 0, 15, 22, 30) / 1000), "2026-01-16T00");
});

test("an hour view is offered for a day, not for a year", async () => {
  const { hourBucketAllowed } = await import("@/app/lib/income/store");

  assert.equal(hourBucketAllowed("2026-10-12", "2026-10-12"), true, "one day");
  assert.equal(hourBucketAllowed("2026-10-11", "2026-10-12"), true, "two days");
  assert.equal(hourBucketAllowed("2026-10-01", "2026-10-12"), false, "a fortnight is 288 columns");
  assert.equal(hourBucketAllowed("2025-10-12", "2026-10-12"), false, "a year is 8,760");
});

test("a day reads as twenty-four columns, each at its own hour", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport, incomeSeries } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");
  savePayments(
    [
      // 17:04 and 17:13 Jerusalem — the same hour, added together.
      doc({ morningId: "a", issuedAt: 1791813897, amount: 100 }),
      doc({ morningId: "b", issuedAt: 1791814429, amount: 50 }),
      // 19:27 Jerusalem.
      doc({ morningId: "c", issuedAt: 1791822468, amount: 300 })
    ],
    new Map()
  );

  const report = incomeReport({ from: "2026-10-12", to: "2026-10-12" });
  const series = incomeSeries(report, "hour");

  assert.equal(series.length, 24, "a day is twenty-four columns, quiet hours included");
  assert.deepEqual(
    series.filter((point) => point.total > 0).map((point) => [point.label, point.total]),
    [["17:00", 150], ["19:00", 300]]
  );
  assert.equal(series[0].label, "00:00");
});

test("an invoice with no issue time is left out rather than filed at midnight", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport, incomeSeries } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");
  savePayments(
    [doc({ morningId: "old", issuedAt: 0, amount: 900 }), doc({ morningId: "new", issuedAt: 1791813897, amount: 100 })],
    new Map()
  );

  const report = incomeReport({ from: "2026-10-12", to: "2026-10-12" });
  assert.equal(report.total.count, 2, "both are still money");
  assert.equal(report.timed, 1, "and the screen can say only one of them has an hour");

  const series = incomeSeries(report, "hour");
  assert.equal(series.find((point) => point.label === "00:00")?.total, 0, "no invented midnight spike");
  assert.equal(series.reduce((sum, point) => sum + point.total, 0), 100);
});

test("the invoice list is one page of ten, however many there are", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport, PER_PAGE } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");
  savePayments(
    Array.from({ length: 25 }, (_, index) =>
      doc({ morningId: `p${index}`, amount: 10 + index, paidOn: "2026-10-12" })
    ),
    new Map()
  );

  assert.equal(PER_PAGE, 10);

  const first = incomeReport({ from: "2026-10-12", to: "2026-10-12" });
  assert.equal(first.payments.length, 10, "ten rows, not twenty-five");
  assert.equal(first.paymentCount, 25, "and the count is the whole range");
  assert.equal(first.pages, 3);
  assert.equal(first.total.count, 25, "the totals still read every invoice");
  assert.equal(first.total.amount, Array.from({ length: 25 }, (_, i) => 10 + i).reduce((a, b) => a + b, 0));

  const last = incomeReport({ from: "2026-10-12", to: "2026-10-12", page: 3 });
  assert.equal(last.payments.length, 5, "the last page is the remainder");
  assert.equal(last.page, 3);

  // A page past the end lands on the last one rather than showing nothing.
  assert.equal(incomeReport({ from: "2026-10-12", to: "2026-10-12", page: 99 }).page, 3);

  // And the chart is still drawn from every invoice, not from the page.
  const { incomeSeries } = await import("@/app/lib/income/store");
  assert.equal(incomeSeries(first, "day")[0].total, first.total.amount, "the chart is not one page tall");
});
