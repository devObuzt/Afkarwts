import { getDb } from "../db";
import type { MorningDoc } from "./morning";
import { type IncomeSource, type Range } from "./kinds";

export type Payment = {
  id: number;
  morningId: string;
  number: string;
  paidOn: string;
  amount: number;
  currency: string;
  methods: number[];
  source: IncomeSource;
  clientName: string;
  clientPhone: string;
  items: string[];
  orderRef: string;
  memberId: number | null;
  memberName: string;
  url: string;
};

type Row = Record<string, string | number | null>;

function mapPayment(row: Row): Payment {
  const parse = (value: unknown) => {
    try {
      const out = JSON.parse(String(value ?? "[]"));
      return Array.isArray(out) ? out : [];
    } catch {
      return [];
    }
  };

  return {
    id: Number(row.id),
    morningId: String(row.morning_id),
    number: String(row.number ?? ""),
    paidOn: String(row.paid_on),
    amount: Number(row.amount ?? 0),
    currency: String(row.currency ?? "ILS"),
    methods: parse(row.methods).map(Number),
    source: String(row.source) as IncomeSource,
    clientName: String(row.client_name ?? ""),
    clientPhone: String(row.client_phone ?? ""),
    items: parse(row.items).map(String),
    orderRef: String(row.order_ref ?? ""),
    memberId: row.member_id === null ? null : Number(row.member_id),
    memberName: String(row.member_name ?? ""),
    url: String(row.url ?? "")
  };
}

/**
 * Where the money came from.
 *
 * Morning cannot say on its own: every document is created by the same
 * account, so `userName` is the same for a website order and a transfer the
 * team collected by hand. What does separate them is the store: an invoice
 * carrying «Order #45740», or belonging to a phone that placed an order,
 * came from the website. Everything else was sold by a person.
 *
 * Measured over 01.09→10.10: 50 of 296 invoices are the website — ₪27,418
 * of ₪249,534. The website is the small half of this business.
 */
export function sourceOf(doc: MorningDoc, storeOrderIds: Set<string>, storePhones: Set<string>): IncomeSource {
  if (doc.orderRef && storeOrderIds.has(doc.orderRef)) {
    return "website";
  }
  if (doc.clientPhone && storePhones.has(doc.clientPhone)) {
    return "website";
  }
  return "sales";
}

/**
 * Writes a batch in, replacing what was there for the same Morning id.
 * Re-syncing a window is therefore safe: the same invoice is one row.
 */
export function savePayments(docs: MorningDoc[], sources: Map<string, IncomeSource>) {
  const db = getDb();
  const findMember = db.prepare("SELECT id, name FROM members WHERE phone = ?");

  const insert = db.prepare(
    `INSERT INTO payments
       (morning_id, number, doc_type, paid_on, amount, currency, methods, source,
        client_name, client_phone, items, description, order_ref, member_id, url, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (morning_id) DO UPDATE SET
       number = excluded.number, paid_on = excluded.paid_on, amount = excluded.amount,
       currency = excluded.currency, methods = excluded.methods, source = excluded.source,
       client_name = excluded.client_name, client_phone = excluded.client_phone,
       items = excluded.items, description = excluded.description, order_ref = excluded.order_ref,
       member_id = excluded.member_id, url = excluded.url, synced_at = CURRENT_TIMESTAMP`
  );

  let written = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
  for (const doc of docs) {
    // The phone is what ties money to a person — and it is missing on about
    // a third of Morning's documents, so the link is left null rather than
    // guessed from a name.
    const member = doc.clientPhone ? (findMember.get(doc.clientPhone) as { id: number } | undefined) : undefined;

    insert.run(
      doc.morningId,
      doc.number,
      doc.docType,
      doc.paidOn,
      doc.amount,
      doc.currency,
      JSON.stringify(doc.methods),
      sources.get(doc.morningId) ?? "sales",
      doc.clientName,
      doc.clientPhone,
      JSON.stringify(doc.items),
      doc.description,
      doc.orderRef,
      member?.id ?? null,
      doc.url
    );
    written += 1;
  }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return written;
}

/** Sunday-start weeks and calendar months, in Asia/Jerusalem. */
export function rangeDates(range: Range, now = new Date(), custom?: { from?: string; to?: string }) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  if (range === "custom") {
    return { from: custom?.from || iso(local), to: custom?.to || iso(local) };
  }

  if (range === "today") {
    return { from: iso(local), to: iso(local) };
  }

  if (range === "week") {
    const start = new Date(local);
    start.setDate(local.getDate() - local.getDay());
    return { from: iso(start), to: iso(local) };
  }

  if (range === "last-month") {
    const start = new Date(local.getFullYear(), local.getMonth() - 1, 1);
    const end = new Date(local.getFullYear(), local.getMonth(), 0);
    return { from: iso(start), to: iso(end) };
  }

  return { from: iso(new Date(local.getFullYear(), local.getMonth(), 1)), to: iso(local) };
}

export type IncomeReport = {
  from: string;
  to: string;
  total: { count: number; amount: number };
  bySource: Array<{ source: IncomeSource; count: number; amount: number }>;
  byMethod: Array<{ method: number; count: number; amount: number }>;
  byItem: Array<{ item: string; count: number; amount: number }>;
  payments: Payment[];
  linked: number;
};

export function incomeReport(filter: { from: string; to: string; method?: number | null }): IncomeReport {
  const db = getDb();
  const where = ["paid_on >= ?", "paid_on <= ?"];
  const args: Array<string | number> = [filter.from, filter.to];

  if (filter.method) {
    // methods is a JSON array; a payment counts if the method is among them.
    where.push("EXISTS (SELECT 1 FROM json_each(payments.methods) WHERE json_each.value = ?)");
    args.push(filter.method);
  }

  const clause = `WHERE ${where.join(" AND ")}`;

  const rows = db
    .prepare(
      `SELECT payments.*, members.name AS member_name
         FROM payments LEFT JOIN members ON members.id = payments.member_id
         ${clause} ORDER BY paid_on DESC, payments.id DESC`
    )
    .all(...args) as Row[];

  const payments = rows.map(mapPayment);
  const round = (value: number) => Math.round(value * 100) / 100;

  const group = <T>(key: (payment: Payment) => T[]) => {
    const counts = new Map<T, { count: number; amount: number }>();
    for (const payment of payments) {
      for (const value of key(payment)) {
        const current = counts.get(value) ?? { count: 0, amount: 0 };
        current.count += 1;
        // A payment split across two methods is counted once per method,
        // so these columns answer «how much came in by card» and are not
        // expected to add up to the total.
        current.amount += payment.amount;
        counts.set(value, current);
      }
    }
    return counts;
  };

  const bySourceMap = group((payment) => [payment.source]);
  const byMethodMap = group((payment) => payment.methods);
  const byItemMap = group((payment) => payment.items);

  return {
    from: filter.from,
    to: filter.to,
    total: { count: payments.length, amount: round(payments.reduce((sum, item) => sum + item.amount, 0)) },
    bySource: (["website", "app", "sales"] as IncomeSource[]).map((source) => ({
      source,
      count: bySourceMap.get(source)?.count ?? 0,
      amount: round(bySourceMap.get(source)?.amount ?? 0)
    })),
    byMethod: [...byMethodMap.entries()]
      .map(([method, value]) => ({ method, count: value.count, amount: round(value.amount) }))
      .sort((a, b) => b.amount - a.amount),
    byItem: [...byItemMap.entries()]
      .map(([item, value]) => ({ item, count: value.count, amount: round(value.amount) }))
      .sort((a, b) => b.amount - a.amount),
    payments,
    linked: payments.filter((payment) => payment.memberId !== null).length
  };
}

export function lastSync() {
  const row = getDb().prepare("SELECT * FROM payment_sync WHERE id = 1").get() as Row | undefined;
  return row
    ? {
        at: row.last_run_at ? String(row.last_run_at) : null,
        from: String(row.last_from ?? ""),
        to: String(row.last_to ?? ""),
        count: Number(row.last_count ?? 0),
        error: String(row.last_error ?? "")
      }
    : null;
}

export function recordSync(input: { from: string; to: string; count: number; error?: string }) {
  getDb()
    .prepare(
      `INSERT INTO payment_sync (id, last_run_at, last_from, last_to, last_count, last_error)
       VALUES (1, CURRENT_TIMESTAMP, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET last_run_at = CURRENT_TIMESTAMP, last_from = excluded.last_from,
         last_to = excluded.last_to, last_count = excluded.last_count, last_error = excluded.last_error`
    )
    .run(input.from, input.to, input.count, input.error ?? "");
}

/**
 * Ties payments to members after the fact. A registration approved today
 * gives a phone that an invoice from last month was already carrying.
 */
export function relinkPayments() {
  const result = getDb()
    .prepare(
      `UPDATE payments SET member_id = (SELECT id FROM members WHERE members.phone = payments.client_phone)
        WHERE client_phone <> '' AND member_id IS NULL
          AND EXISTS (SELECT 1 FROM members WHERE members.phone = payments.client_phone)`
    )
    .run();
  return Number(result.changes);
}

export type Bucket = "day" | "week" | "month";

export type SeriesPoint = {
  key: string;
  label: string;
  website: number;
  app: number;
  sales: number;
  total: number;
};

/** Sunday-start weeks, like the rest of the system. */
function startOfWeek(iso: string) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

/**
 * The same money, bucketed for the chart.
 *
 * Empty buckets are kept: a week with no income is a fact about the week,
 * and dropping it would draw a flat line over a gap.
 */
export function incomeSeries(report: IncomeReport, bucket: Bucket): SeriesPoint[] {
  const keyOf = (paidOn: string) =>
    bucket === "day" ? paidOn : bucket === "week" ? startOfWeek(paidOn) : `${paidOn.slice(0, 7)}-01`;

  const points = new Map<string, SeriesPoint>();

  const blank = (key: string): SeriesPoint => ({
    key,
    label: bucket === "month" ? key.slice(0, 7) : key.slice(5).split("-").reverse().join("/"),
    website: 0,
    app: 0,
    sales: 0,
    total: 0
  });

  // Walk the whole window so a quiet day still gets a column.
  const cursor = new Date(`${report.from}T00:00:00Z`);
  const end = new Date(`${report.to}T00:00:00Z`);
  while (cursor <= end) {
    const key = keyOf(cursor.toISOString().slice(0, 10));
    if (!points.has(key)) {
      points.set(key, blank(key));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const payment of report.payments) {
    const key = keyOf(payment.paidOn);
    const point = points.get(key) ?? blank(key);
    point[payment.source] += payment.amount;
    point.total += payment.amount;
    points.set(key, point);
  }

  const round = (value: number) => Math.round(value * 100) / 100;
  return [...points.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((point) => ({
      ...point,
      website: round(point.website),
      app: round(point.app),
      sales: round(point.sales),
      total: round(point.total)
    }));
}
