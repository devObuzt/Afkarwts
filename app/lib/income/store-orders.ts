import { normalizeImportPhone } from "../db";

/**
 * The shop's own answer to «did this come from the website».
 *
 * Morning cannot tell us — every document there is created by the same
 * account. WooCommerce can: an order id, and the phone that placed it.
 */
export function storeConfigured() {
  return Boolean(process.env.WC_URL && process.env.WC_KEY && process.env.WC_SECRET);
}

export async function fetchStoreOrders(from: string) {
  if (!storeConfigured()) {
    return { orderIds: new Set<string>(), phones: new Set<string>(), reachable: false };
  }

  const base = `${String(process.env.WC_URL).replace(/\/$/, "")}/wp-json/wc/v3`;
  const auth = Buffer.from(`${process.env.WC_KEY}:${process.env.WC_SECRET}`).toString("base64");

  const orderIds = new Set<string>();
  const phones = new Set<string>();

  for (let page = 1; page <= 20; page += 1) {
    const url = `${base}/orders?after=${from}T00:00:00&per_page=100&page=${page}&status=any`;
    const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });

    if (!response.ok) {
      // A shop that will not answer must not turn every sale into a website
      // sale, nor every website sale into a hand sale without saying so.
      throw new Error(`The shop refused the request (${response.status}).`);
    }

    const orders = (await response.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(orders) || !orders.length) {
      break;
    }

    for (const order of orders) {
      orderIds.add(String(order.id));
      const billing = (order.billing ?? {}) as Record<string, unknown>;
      try {
        const phone = billing.phone ? normalizeImportPhone(String(billing.phone)) : "";
        if (phone) {
          phones.add(phone);
        }
      } catch {
        // A shop phone nobody can dial is not a match key.
      }
    }

    if (orders.length < 100) {
      break;
    }
  }

  return { orderIds, phones, reachable: true };
}
