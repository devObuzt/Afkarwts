import { getDb } from "./db";

/**
 * A local nickname for a Meta template. Afkar has 57 templates whose names
 * differ by a word, so the list is hard to read; this makes it readable
 * without touching anything at Meta. The alias never leaves this database —
 * sends always use the real template name.
 */
export function listAliases(): Record<string, string> {
  const rows = getDb().prepare("SELECT template_name, alias FROM template_aliases").all() as Array<{
    template_name: string;
    alias: string;
  }>;

  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.alias.trim()) {
      out[row.template_name] = row.alias;
    }
  }
  return out;
}

export function setAlias(templateName: string, alias: string) {
  const trimmed = alias.trim();

  if (!trimmed) {
    getDb().prepare("DELETE FROM template_aliases WHERE template_name = ?").run(templateName);
    return;
  }

  getDb()
    .prepare(
      `INSERT INTO template_aliases (template_name, alias) VALUES (?, ?)
       ON CONFLICT (template_name) DO UPDATE SET alias = excluded.alias, updated_at = CURRENT_TIMESTAMP`
    )
    .run(templateName, trimmed);
}
