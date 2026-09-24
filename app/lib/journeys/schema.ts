import type { DatabaseSync } from "node:sqlite";

/**
 * Journeys live in their own tables beside campaigns. Nothing here alters an
 * existing table, so the migration is safe to run against a production copy.
 */
function addColumnIfMissing(db: DatabaseSync, table: string, column: string, definition: string) {
  const has = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).some(
    (row) => row.name === column
  );
  if (!has) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function migrateJourneyTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journey_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sms_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS journey_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      week INTEGER NOT NULL,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      send_time TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      free_text TEXT NOT NULL DEFAULT '',
      template_name TEXT NOT NULL,
      template_language TEXT NOT NULL DEFAULT 'ar',
      body_params TEXT NOT NULL DEFAULT '[]',
      template_preview TEXT NOT NULL DEFAULT '',
      sms_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT,
      FOREIGN KEY (template_id) REFERENCES journey_templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      anchor_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'done')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      activated_at TEXT,
      FOREIGN KEY (template_id) REFERENCES journey_templates(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journey_enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journey_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'stopped', 'completed', 'removed')),
      stop_reason TEXT,
      stopped_at TEXT,
      enrolled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (journey_id, member_id),
      FOREIGN KEY (journey_id) REFERENCES journeys(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS journey_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER NOT NULL,
      step_id INTEGER NOT NULL,
      channel TEXT,
      message_id INTEGER,
      state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'failed', 'deferred', 'missed', 'skipped')),
      error TEXT,
      attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (enrollment_id, step_id),
      FOREIGN KEY (enrollment_id) REFERENCES journey_enrollments(id) ON DELETE CASCADE,
      FOREIGN KEY (step_id) REFERENCES journey_steps(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL,
      enrollment_id INTEGER,
      kind TEXT NOT NULL CHECK (kind IN ('sms', 'manual')),
      reason TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL CHECK (state IN ('queued', 'sent', 'failed', 'open', 'done')),
      body TEXT NOT NULL DEFAULT '',
      provider_ref TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
      FOREIGN KEY (enrollment_id) REFERENCES journey_enrollments(id) ON DELETE SET NULL
    );

    -- A nickname we keep for a Meta template, so a list of near-identical
    -- names is readable. It is ours alone and never sent to Meta.
    CREATE TABLE IF NOT EXISTS template_aliases (
      template_name TEXT PRIMARY KEY,
      alias TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_journey_sends_enrollment ON journey_sends(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_journey_state ON journey_enrollments(journey_id, state);
    CREATE INDEX IF NOT EXISTS idx_followups_state ON followups(kind, state);
  `);

  // Added after the first release: the SMS a step falls back to, and which step
  // a follow-up belongs to.
  addColumnIfMissing(db, "journey_steps", "sms_text", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, "followups", "step_id", "INTEGER");
}
