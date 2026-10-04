import type { DatabaseSync } from "node:sqlite";

/**
 * Users, and the record of what they did.
 *
 * Before this there was one shared login out of the environment, so «who
 * sent that» had no answer at all. The environment credentials become the
 * first owner on migration rather than a second way in, so there is one
 * path to guard.
 */
export function migrateUserTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'assistant' CHECK (role IN ('owner', 'assistant', 'coach', 'developer')),
      permissions TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      actor TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      subject_type TEXT NOT NULL DEFAULT '',
      subject_id TEXT NOT NULL DEFAULT '',
      subject_label TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at DESC);
  `);
}
