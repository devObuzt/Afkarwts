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

    const written = savePayments(docs, sources);
    const linked = relinkPayments();
    recordSync({ from, to, count: written });

    return { ok: true as const, written, linked, storeReachable: store.reachable };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّرت المزامنة.";
    recordSync({ from, to, count: 0, error: message });
    return { ok: false as const, error: message };
  }
}
