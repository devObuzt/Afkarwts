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
