import type { DatabaseSync } from "node:sqlite";

/**
 * SQLite cannot widen a CHECK constraint, and the production table was created
 * before towns and signatures existed as field kinds — so the table is rebuilt
 * once, carrying its rows across. Detected by reading the stored DDL rather
 * than by a version number, so running it twice is harmless.
 */
function widenFieldKinds(db: DatabaseSync) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'form_fields'").get() as
    | { sql: string }
    | undefined;

  if (!row || row.sql.includes("'signature'")) {
    return;
  }

  // SQLite's own table-rebuild procedure: foreign keys off around the swap.
  // Without it a single orphan row aborts the migration — and this runs at
  // startup, so an abort means the app does not boot at all.
  db.exec("PRAGMA foreign_keys = OFF");

  db.exec(`
    ALTER TABLE form_fields RENAME TO form_fields_old;

    CREATE TABLE form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      label TEXT NOT NULL,
      help TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('text', 'textarea', 'phone', 'date', 'choice', 'multi', 'consent', 'town', 'signature')),
      required INTEGER NOT NULL DEFAULT 0,
      options TEXT NOT NULL DEFAULT '[]',
      map_to TEXT NOT NULL DEFAULT '',
      show_when_field_id INTEGER,
      show_when_value TEXT NOT NULL DEFAULT '',
      archived_at TEXT,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    INSERT INTO form_fields (id, form_id, position, label, help, kind, required, options, map_to, archived_at)
      SELECT id, form_id, position, label, help, kind, required, options, map_to, archived_at FROM form_fields_old;

    DROP TABLE form_fields_old;

    CREATE INDEX IF NOT EXISTS idx_form_fields_form ON form_fields(form_id, position);
  `);

  db.exec("PRAGMA foreign_keys = ON");
}

/**
 * Registration forms live in their own tables beside members and journeys.
 * Every step here is safe to re-run against the production database.
 */
export function migrateFormTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      group_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      title TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      label TEXT NOT NULL,
      help TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('text', 'textarea', 'phone', 'date', 'choice', 'multi', 'consent', 'town', 'signature')),
      required INTEGER NOT NULL DEFAULT 0,
      options TEXT NOT NULL DEFAULT '[]',
      map_to TEXT NOT NULL DEFAULT '',
      show_when_field_id INTEGER,
      show_when_value TEXT NOT NULL DEFAULT '',
      archived_at TEXT,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS form_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'added', 'rejected')),
      member_id INTEGER,
      name TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      handled_at TEXT,
      FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
    );

    -- The answer carries its own question text, so a registration stays
    -- readable years later even after the question is reworded or removed.
    CREATE TABLE IF NOT EXISTS form_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id INTEGER NOT NULL,
      field_id INTEGER,
      label TEXT NOT NULL,
      value TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (submission_id) REFERENCES form_submissions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_form_fields_form ON form_fields(form_id, position);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON form_submissions(form_id, state);
    CREATE INDEX IF NOT EXISTS idx_form_answers_submission ON form_answers(submission_id);
  `);

  addColumnIfMissing(db, "forms", "title", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "form_fields", "show_when_field_id", "INTEGER");
  addColumnIfMissing(db, "form_fields", "show_when_value", "TEXT NOT NULL DEFAULT ''");
  widenFieldKinds(db);
}

/** Adds a column only when it is missing, so the migration is safe to re-run. */
function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string) {
  const has = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column
  );
  if (!has) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
