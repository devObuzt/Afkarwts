import type { DatabaseSync } from "node:sqlite";

/**
 * Income, copied from Morning rather than read from it live.
 *
 * Morning answers a search in one call but hides the client's phone, the
 * payment method and the catalogue line until the document is fetched one
 * by one — 296 requests for six weeks of invoices. A screen cannot wait for
 * that, and Afkar should not have to.
 *
 * So the rows live here and a sync keeps them current. Everything the
 * screen filters on is a column, and `morning_id` makes a re-sync an update
 * rather than a duplicate.
 */
export function migrateIncomeTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      morning_id TEXT NOT NULL UNIQUE,
      number TEXT NOT NULL DEFAULT '',
      doc_type INTEGER NOT NULL DEFAULT 0,
      paid_on TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'ILS',
      methods TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT 'sales',
      client_name TEXT NOT NULL DEFAULT '',
      client_phone TEXT NOT NULL DEFAULT '',
      items TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      order_ref TEXT NOT NULL DEFAULT '',
      member_id INTEGER,
      url TEXT NOT NULL DEFAULT '',
      sold_by TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_payments_paid_on ON payments(paid_on DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_member ON payments(member_id);
    CREATE INDEX IF NOT EXISTS idx_payments_phone ON payments(client_phone);

    CREATE TABLE IF NOT EXISTS payment_sync (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_run_at TEXT,
      last_from TEXT,
      last_to TEXT,
      last_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      backfilled_from TEXT NOT NULL DEFAULT ''
    );
  `);
}

/** Who sold it. Added once the first figures showed nobody could say. */
export function migrateSellerColumn(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(payments)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "sold_by")) {
    db.exec("ALTER TABLE payments ADD COLUMN sold_by TEXT NOT NULL DEFAULT ''");
  }
}

/** Added after the first backfill died half-way and left the table looking full. */
export function migrateBackfillColumn(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(payment_sync)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "backfilled_from")) {
    db.exec("ALTER TABLE payment_sync ADD COLUMN backfilled_from TEXT NOT NULL DEFAULT ''");
  }
}

/**
 * The hour, not only the day.
 *
 * Morning's `documentDate` is the day the money is booked to and carries
 * no time at all; `creationDate` is a Unix timestamp of when the document
 * was issued, which for a 320 — invoice and receipt in one — is the
 * moment of the sale. Stored as seconds UTC and turned into an
 * Asia/Jerusalem hour when it is read, because the container runs UTC
 * and a local-time reading would be three hours out.
 */
export function migrateIssuedAtColumn(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(payments)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "issued_at")) {
    db.exec("ALTER TABLE payments ADD COLUMN issued_at INTEGER");
  }
}
