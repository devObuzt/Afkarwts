import type { DatabaseSync } from "node:sqlite";

/**
 * Registration forms live in their own tables beside members and journeys.
 * Nothing here alters an existing table, so the migration is safe to run
 * against the production database.
 */
export function migrateFormTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      group_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
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
      kind TEXT NOT NULL CHECK (kind IN ('text', 'textarea', 'phone', 'date', 'choice', 'multi', 'consent')),
      required INTEGER NOT NULL DEFAULT 0,
      options TEXT NOT NULL DEFAULT '[]',
      map_to TEXT NOT NULL DEFAULT '',
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
}
