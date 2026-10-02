import test from "node:test";
import assert from "node:assert/strict";
import { useTempDataDir } from "./helpers/data-dir.ts";

useTempDataDir();

test("rebuilding the field table for new kinds carries every row across", async () => {
  const { getDb, createGroup } = await import("@/app/lib/db");
  const { migrateFormTables } = await import("@/app/lib/forms/schema");
  const db = getDb();

  const group = createGroup("هجرة");
  db.prepare("INSERT INTO forms (id, name, token, group_id) VALUES (1, 'نموذج', 'tok1', ?)").run(group.id);

  // Put the table back the way production had it, before towns and signatures
  // were kinds — the real starting point this migration has to survive.
  db.exec(`
    DROP TABLE IF EXISTS form_fields;
    CREATE TABLE form_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      position INTEGER NOT NULL,
      label TEXT NOT NULL,
      help TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL CHECK (kind IN ('text', 'textarea', 'phone', 'date', 'choice', 'multi', 'consent')),
      required INTEGER NOT NULL DEFAULT 0,
      options TEXT NOT NULL DEFAULT '[]',
      map_to TEXT NOT NULL DEFAULT '',
      archived_at TEXT
    );
  `);

  db.prepare(
    "INSERT INTO form_fields (form_id, position, label, help, kind, required, options, map_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(1, 1, "الاسم الكامل", "", "text", 1, "[]", "name");
  db.prepare(
    "INSERT INTO form_fields (form_id, position, label, help, kind, required, options, map_to, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(1, 2, "سؤال محذوف", "ملاحظة", "choice", 0, '["نعم","لا"]', "", "2026-10-01T00:00:00Z");

  migrateFormTables(db);

  const rows = db.prepare("SELECT * FROM form_fields ORDER BY position").all() as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2, "both rows survived the rebuild");
  assert.equal(rows[0].label, "الاسم الكامل");
  assert.equal(rows[0].map_to, "name");
  assert.equal(rows[1].options, '["نعم","لا"]');
  assert.equal(rows[1].archived_at, "2026-10-01T00:00:00Z", "an archived question stays archived");
  assert.equal(rows[0].show_when_value, "", "the new columns exist");

  // And the point of the rebuild: the new kinds are now accepted.
  db.prepare("INSERT INTO form_fields (form_id, position, label, kind) VALUES (?, ?, ?, ?)").run(1, 3, "البلد", "town");
  db.prepare("INSERT INTO form_fields (form_id, position, label, kind) VALUES (?, ?, ?, ?)").run(1, 4, "توقيع", "signature");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM form_fields").get() as { n: number }).n, 4);
});

test("running the migration twice changes nothing", async () => {
  const { getDb } = await import("@/app/lib/db");
  const { migrateFormTables } = await import("@/app/lib/forms/schema");
  const db = getDb();

  const before = (db.prepare("SELECT COUNT(*) AS n FROM form_fields").get() as { n: number }).n;
  migrateFormTables(db);
  migrateFormTables(db);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM form_fields").get() as { n: number }).n, before);
});
