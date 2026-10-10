import { fetchPaidInvoices, morningConfigured } from "./morning";
import { fetchStoreOrders } from "./store-orders";
import { recordSync, relinkPayments, savePayments, sourceOf } from "./store";
import type { IncomeSource } from "./kinds";

/**
 * Pulls a window of paid invoices in and decides where each came from.
 *
 * The shop is asked first: if it cannot answer, nothing is written. A sync
 * that silently filed every website order under «sales» would be worse than
 * no sync, because the number would look right.
 */
export async function syncIncome(from: string, to: string) {
  if (!morningConfigured()) {
    const error = "مفاتيح Morning غير مضبوطة على هذه الخدمة.";
    recordSync({ from, to, count: 0, error });
    return { ok: false as const, error };
  }

  try {
    const store = await fetchStoreOrders(from);
    const docs = await fetchPaidInvoices(from, to);

    const sources = new Map<string, IncomeSource>();
    for (const doc of docs) {
      sources.set(doc.morningId, sourceOf(doc, store.orderIds, store.phones));
    }

    // Written in chunks: one lock held for eighteen months of invoices is
    // a lock held while the rest of the app wants to work.
    let written = 0;
    for (let index = 0; index < docs.length; index += 100) {
      written += savePayments(docs.slice(index, index + 100), sources);
    }
    const linked = relinkPayments();
    recordSync({ from, to, count: written });

    return { ok: true as const, written, linked, storeReachable: store.reachable };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّرت المزامنة.";
    recordSync({ from, to, count: 0, error: message });
    return { ok: false as const, error: message };
  }
}

/** How far back a routine top-up reaches. Cheap: a fortnight is a few dozen documents. */
export const RECENT_DAYS = 14;

/** The first run goes back far enough that the screen opens on a real picture. */
export const BACKFILL_MONTHS = 18;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Keeps the figures current without anyone pressing anything.
 *
 * An empty screen is not a reading — it looks like a business that took no
 * money. So the first run reaches back eighteen months, and every run after
 * that tops up the last fortnight, which is all that can still change.
 */
export async function syncIncomeAutomatically(now = new Date()) {
  const { getDb } = await import("../db");
  const existing = Number(
    (getDb().prepare("SELECT COUNT(*) AS n FROM payments").get() as { n: number }).n
  );

  const to = isoDay(now);
  const from = existing
    ? isoDay(new Date(now.getTime() - RECENT_DAYS * 24 * 60 * 60 * 1000))
    : isoDay(new Date(now.getFullYear(), now.getMonth() - BACKFILL_MONTHS, 1));

  return syncIncome(from, to);
}
