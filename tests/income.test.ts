import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

let seq = 0;

function doc(over: Partial<Record<string, unknown>> = {}) {
  seq += 1;
  return {
    morningId: `m${seq}`,
    number: String(1000 + seq),
    docType: 320,
    paidOn: "2026-10-05",
    amount: 445,
    currency: "ILS",
    methods: [3],
    clientName: "ليلى عوض",
    clientPhone: "",
    items: ["CLEAN"],
    description: "تשלום עבור מסלול",
    orderRef: "",
    url: "",
    ...over
  } as never;
}

test("only a paid invoice is read, and its parts are pulled out", async () => {
  const { mapDoc, PAID_INVOICE, orderRefOf } = await import("@/app/lib/income/morning");

  assert.equal(PAID_INVOICE, 320, "חשבונית מס קבלה — the only type that proves money arrived");

  const mapped = mapDoc({
    id: "abc",
    number: 1234,
    type: 320,
    documentDate: "2026-10-05T00:00:00.000Z",
    creationDate: "2026-10-09T00:00:00.000Z",
    amount: 445,
    currency: "ILS",
    client: { name: "ليلى عوض", phone: "0521234567" },
    payment: [{ type: 3 }, { type: 3 }, { type: 10 }],
    income: [{ catalogNum: "CLEAN" }, { catalogNum: "משלוחים" }],
    description: "Order #45740"
  });

  assert.equal(mapped.paidOn, "2026-10-05", "the day it is booked to, not the day it was typed in");
  assert.deepEqual(mapped.methods, [3, 10], "each method once");
  assert.deepEqual(mapped.items, ["CLEAN", "משלוחים"]);
  assert.equal(mapped.clientPhone, "+972521234567", "stored the way a member's phone is");
  assert.equal(mapped.orderRef, "45740");
  assert.equal(orderRefOf("תשלום עבור מסלול"), "", "no order number in the website's own wording");
});

test("the source is the store's answer, because Morning has only one user", async () => {
  const { sourceOf } = await import("@/app/lib/income/store");

  const orders = new Set(["45740"]);
  const phones = new Set(["+972521234567"]);

  assert.equal(sourceOf(doc({ orderRef: "45740" }), orders, phones), "website", "by order number");
  assert.equal(sourceOf(doc({ clientPhone: "+972521234567" }), orders, phones), "website", "by the phone that ordered");
  assert.equal(sourceOf(doc({ orderRef: "99999" }), orders, phones), "sales", "an order number the store never saw");
  assert.equal(sourceOf(doc({ description: "העברה מאת: ..." }), orders, phones), "sales", "a bank transfer");
  assert.equal(sourceOf(doc(), orders, phones), "sales", "anything the store cannot account for");
});

test("a re-sync updates the invoice rather than counting it twice", async () => {
  const { savePayments, incomeReport } = await import("@/app/lib/income/store");

  const one = doc({ morningId: "same", amount: 445, paidOn: "2026-10-05" });
  savePayments([one], new Map([["same", "sales"]]));
  savePayments([{ ...(one as object), amount: 500 } as never], new Map([["same", "website"]]));

  const report = incomeReport({ from: "2026-10-05", to: "2026-10-05" });
  assert.equal(report.total.count, 1, "one invoice, synced twice");
  assert.equal(report.total.amount, 500, "and the later reading wins");
  assert.equal(report.bySource.find((row) => row.source === "website")?.count, 1);
});

test("a payment finds its member by phone, now or later", async () => {
  const { createMember, getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport, relinkPayments } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");

  // The invoice arrives before the registration is approved.
  savePayments([doc({ morningId: "early", clientPhone: "+972539998877", paidOn: "2026-10-06" })], new Map());
  assert.equal(incomeReport({ from: "2026-10-06", to: "2026-10-06" }).linked, 0);

  createMember({ name: "مريم", phone: "+972539998877" });
  assert.equal(relinkPayments(), 1, "the approval ties the money to the person");

  const report = incomeReport({ from: "2026-10-06", to: "2026-10-06" });
  assert.equal(report.linked, 1);
  assert.equal(report.payments[0].memberName, "مريم");
});

test("the report splits by source, method and مسار, and filters on method", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");
  savePayments(
    [
      doc({ morningId: "a", amount: 445, methods: [3], items: ["CLEAN"], paidOn: "2026-10-01" }),
      doc({ morningId: "b", amount: 1200, methods: [4], items: ["EXTRA+"], paidOn: "2026-10-02" }),
      doc({ morningId: "c", amount: 300, methods: [10], items: ["CLEAN"], paidOn: "2026-10-03" })
    ],
    new Map([
      ["a", "website"],
      ["b", "sales"],
      ["c", "sales"]
    ])
  );

  const all = incomeReport({ from: "2026-10-01", to: "2026-10-31" });
  assert.equal(all.total.count, 3);
  assert.equal(all.total.amount, 1945);
  assert.equal(all.bySource.find((row) => row.source === "website")?.amount, 445);
  assert.equal(all.bySource.find((row) => row.source === "sales")?.amount, 1500);
  assert.equal(all.bySource.find((row) => row.source === "app")?.count, 0, "the app has not launched");
  assert.equal(all.byItem[0].item, "EXTRA+", "biggest first");
  assert.equal(all.byItem.find((row) => row.item === "CLEAN")?.count, 2);

  const card = incomeReport({ from: "2026-10-01", to: "2026-10-31", method: 3 });
  assert.equal(card.total.count, 1);
  assert.equal(card.total.amount, 445);
});

test("the ranges are calendar ranges in Afkar's own timezone", async () => {
  const { rangeDates } = await import("@/app/lib/income/store");
  // A Thursday.
  const now = new Date("2026-10-08T09:00:00.000Z");

  assert.deepEqual(rangeDates("today", now), { from: "2026-10-08", to: "2026-10-08" });
  assert.deepEqual(rangeDates("week", now), { from: "2026-10-04", to: "2026-10-08" }, "weeks start on Sunday");
  assert.deepEqual(rangeDates("month", now), { from: "2026-10-01", to: "2026-10-08" });
  assert.deepEqual(rangeDates("last-month", now), { from: "2026-09-01", to: "2026-09-30" }, "a whole month, not 30 days back");
  assert.deepEqual(rangeDates("custom", now, { from: "2026-07-01", to: "2026-07-31" }), {
    from: "2026-07-01",
    to: "2026-07-31"
  });
});

test("the series buckets by day, week and month, and keeps the quiet ones", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport, incomeSeries } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");
  savePayments(
    [
      doc({ morningId: "s1", amount: 100, paidOn: "2026-10-01" }),
      doc({ morningId: "s2", amount: 200, paidOn: "2026-10-01" }),
      doc({ morningId: "s3", amount: 300, paidOn: "2026-10-05" }),
      doc({ morningId: "s4", amount: 400, paidOn: "2026-09-28" })
    ],
    new Map([
      ["s1", "website"],
      ["s2", "sales"],
      ["s3", "sales"],
      ["s4", "website"]
    ])
  );

  const report = incomeReport({ from: "2026-09-28", to: "2026-10-05" });

  const days = incomeSeries(report, "day");
  assert.equal(days.length, 8, "a day with nothing in it is still a day");
  assert.equal(days[0].key, "2026-09-28");
  assert.equal(days.find((d) => d.key === "2026-10-01")?.total, 300);
  assert.equal(days.find((d) => d.key === "2026-10-01")?.website, 100);
  assert.equal(days.find((d) => d.key === "2026-10-01")?.sales, 200);
  assert.equal(days.find((d) => d.key === "2026-10-02")?.total, 0, "the quiet day is kept");

  const weeks = incomeSeries(report, "week");
  assert.deepEqual(weeks.map((w) => w.key), ["2026-09-27", "2026-10-04"], "weeks start on Sunday");
  assert.equal(weeks[0].total, 700, "28.09 + 01.10 fall in the same week");
  assert.equal(weeks[1].total, 300);

  const months = incomeSeries(report, "month");
  assert.deepEqual(months.map((m) => m.label), ["2026-09", "2026-10"]);
  assert.equal(months[0].total, 400);
  assert.equal(months[1].total, 600);

  // Every bucket adds up to the same money, whichever way it is cut.
  for (const series of [days, weeks, months]) {
    assert.equal(series.reduce((sum, point) => sum + point.total, 0), 1000);
    assert.equal(
      series.reduce((sum, point) => sum + point.website + point.app + point.sales, 0),
      1000,
      "the parts are the whole — the total is not a fourth source"
    );
  }
});

test("the database lets a reader and a writer work at once", async () => {
  const { getDb } = await import("@/app/lib/db");
  const db = getDb();

  // It shipped on the rollback journal with no timeout, so one page being
  // read killed a write outright — that is what stopped the first Morning
  // backfill at 133 rows of 296.
  assert.equal((db.prepare("PRAGMA journal_mode").get() as { journal_mode: string }).journal_mode, "wal");
  assert.ok(
    Number((db.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout) >= 5000,
    "a writer waits its turn rather than failing instantly"
  );
});

test("a batch that fails writes none of itself", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, incomeReport } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");

  const good = doc({ morningId: "ok1", paidOn: "2026-11-01", amount: 100 });
  // paid_on is NOT NULL; a row missing it takes the whole batch down with it.
  const bad = { ...(doc({ morningId: "bad1", paidOn: "2026-11-01" }) as object), paidOn: null } as never;

  assert.throws(() => savePayments([good, bad], new Map()));
  assert.equal(
    incomeReport({ from: "2026-11-01", to: "2026-11-01" }).total.count,
    0,
    "the good row rolled back with the bad one, so a retry cannot double-count"
  );
});

test("a half-finished backfill does not count as history", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { savePayments, backfilledFrom, markBackfilled } = await import("@/app/lib/income/store");

  getDb().exec("DELETE FROM payments");
  getDb().exec("DELETE FROM payment_sync");

  // Exactly the state the first run left behind: rows in the table, but no
  // completed pull — so «is it empty» answered yes and the history was
  // never fetched.
  savePayments([doc({ morningId: "partial", paidOn: "2026-10-01" })], new Map());
  assert.equal(backfilledFrom(), "", "rows are not a record of coverage");

  markBackfilled("2025-04-01");
  assert.equal(backfilledFrom(), "2025-04-01");
});
