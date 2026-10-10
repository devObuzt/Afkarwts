import { normalizeImportPhone } from "../db";

/**
 * Reading income out of Morning (Green Invoice).
 *
 * Only `type: 320` — חשבונית מס קבלה — proves money arrived. A 305 is an
 * invoice nobody has paid yet and a 400 is a receipt on its own; counting
 * either would overstate the month. The same rule the reconciler uses.
 *
 * A search gives the amount and the date but not the phone, the payment
 * method or the catalogue line, so each document is fetched once more.
 */

const MORNING = "https://api.greeninvoice.co.il/api/v1";
export const PAID_INVOICE = 320;

export type MorningDoc = {
  morningId: string;
  number: string;
  docType: number;
  paidOn: string;
  amount: number;
  currency: string;
  methods: number[];
  clientName: string;
  clientPhone: string;
  items: string[];
  description: string;
  orderRef: string;
  url: string;
};

type Raw = Record<string, unknown>;

export function morningConfigured() {
  return Boolean(process.env.MORNING_KEY_ID && process.env.MORNING_KEY_SECRET);
}

async function token() {
  const response = await fetch(`${MORNING}/account/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: process.env.MORNING_KEY_ID, secret: process.env.MORNING_KEY_SECRET })
  });

  if (!response.ok) {
    throw new Error(`Morning refused the key (${response.status}).`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error("Morning returned no token.");
  }
  return payload.token;
}

/** A store order id, when the document says which one it came from. */
export function orderRefOf(description: string) {
  return /Order #(\d+)/.exec(description)?.[1] ?? "";
}

export function mapDoc(raw: Raw): MorningDoc {
  const client = (raw.client ?? {}) as Record<string, unknown>;
  const payments = (raw.payment ?? []) as Array<Record<string, unknown>>;
  const income = (raw.income ?? []) as Array<Record<string, unknown>>;
  const description = String(raw.description ?? "");

  const rawPhone = String(client.phone ?? client.mobile ?? "");
  let phone = "";
  try {
    phone = rawPhone ? normalizeImportPhone(rawPhone) : "";
  } catch {
    phone = "";
  }

  return {
    morningId: String(raw.id ?? ""),
    number: String(raw.number ?? ""),
    docType: Number(raw.type ?? 0),
    // documentDate is the day the money is booked to; creationDate is when
    // somebody got round to typing it in.
    paidOn: String(raw.documentDate ?? raw.creationDate ?? "").slice(0, 10),
    amount: Number(raw.amount ?? 0),
    currency: String(raw.currency ?? "ILS"),
    methods: [...new Set(payments.map((payment) => Number(payment.type)).filter(Number.isFinite))],
    clientName: String(client.name ?? ""),
    clientPhone: phone,
    items: [...new Set(income.map((line) => String(line.catalogNum ?? "").trim()).filter(Boolean))],
    description,
    orderRef: orderRefOf(description),
    url: String((raw.url as Record<string, unknown> | undefined)?.origin ?? "")
  };
}

/** Every paid invoice in a window, with the detail a search leaves out. */
export async function fetchPaidInvoices(from: string, to: string): Promise<MorningDoc[]> {
  const bearer = await token();
  const headers = { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" };

  const found: Raw[] = [];
  for (let page = 1; page <= 40; page += 1) {
    const response = await fetch(`${MORNING}/documents/search`, {
      method: "POST",
      headers,
      body: JSON.stringify({ fromDate: from, toDate: to, page, pageSize: 100 })
    });

    if (!response.ok) {
      throw new Error(`Morning search failed (${response.status}).`);
    }

    const payload = (await response.json()) as { items?: Raw[]; total?: number };
    const items = payload.items ?? [];
    found.push(...items);

    if (!items.length || page * 100 >= (payload.total ?? 0)) {
      break;
    }
  }

  const paid = found.filter((doc) => Number(doc.type) === PAID_INVOICE);

  // A few at a time: 300 documents is 300 requests, and Morning rate-limits.
  const docs: MorningDoc[] = [];
  for (let index = 0; index < paid.length; index += 8) {
    const batch = await Promise.all(
      paid.slice(index, index + 8).map(async (doc) => {
        const response = await fetch(`${MORNING}/documents/${String(doc.id)}`, { headers });
        return response.ok ? ((await response.json()) as Raw) : doc;
      })
    );
    docs.push(...batch.map(mapDoc));
  }

  return docs;
}
