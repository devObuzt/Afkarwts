import type { DatabaseSync } from "node:sqlite";

/**
 * Labels, after watching how Afkar actually works.
 *
 * Her WhatsApp carries four kinds of list at once and a person wears
 * several: the مسار she belongs to (Extra+ · Step · Clean), the دفعة she
 * started with (16.8 · 1.10), a حالة (متابعة مسار · بانتظار أفكار · حامل),
 * and the مرافِقة following her up. This system had one flat «group», so all
 * four were being squeezed into the same box — which is how the screens
 * ended up calling a مسار a «دورة» in the first place.
 *
 * The table stays `groups`: journeys and forms point at it by id, and
 * renaming it would be churn with no gain. What it gains is a kind.
 */
function hasColumn(db: DatabaseSync, table: string, column: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

export function migrateLabelColumns(db: DatabaseSync) {
  if (!hasColumn(db, "groups", "kind")) {
    // No CHECK: SQLite cannot widen one later, and a fifth kind is likely.
    db.exec("ALTER TABLE groups ADD COLUMN kind TEXT NOT NULL DEFAULT 'batch'");
  }

  if (!hasColumn(db, "groups", "colour")) {
    db.exec("ALTER TABLE groups ADD COLUMN colour TEXT NOT NULL DEFAULT ''");
  }

  // A label the system maintains: it is put on and taken off by the engine
  // rather than by hand, and the screens say so.
  if (!hasColumn(db, "groups", "managed")) {
    db.exec("ALTER TABLE groups ADD COLUMN managed TEXT NOT NULL DEFAULT ''");
  }

  // When someone sets or clears a managed label by hand, the engine stops
  // touching that one person — «المنظومة لحالها + تعديل يدوي» means the hand
  // wins, and keeps winning.
  if (!hasColumn(db, "member_groups", "pinned")) {
    db.exec("ALTER TABLE member_groups ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
  }

  // Who follows this person up. Maria and Jwana are lists in her WhatsApp;
  // here they are accounts, so the assignment can also decide what they see.
  if (!hasColumn(db, "members", "assigned_user_id")) {
    db.exec("ALTER TABLE members ADD COLUMN assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL");
    db.exec("CREATE INDEX IF NOT EXISTS idx_members_assigned ON members(assigned_user_id)");
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_groups_kind ON groups(kind)");
}
