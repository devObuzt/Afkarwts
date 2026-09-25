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
    // The row also carries whether the template is frozen, so clearing the
    // nickname empties that one field rather than dropping the row — deleting
    // it would quietly bring a frozen template back into every picker.
    getDb().prepare("UPDATE template_aliases SET alias = '' WHERE template_name = ?").run(templateName);
    getDb().prepare("DELETE FROM template_aliases WHERE template_name = ? AND alias = '' AND frozen_at IS NULL").run(
      templateName
    );
    return;
  }

  getDb()
    .prepare(
      `INSERT INTO template_aliases (template_name, alias) VALUES (?, ?)
       ON CONFLICT (template_name) DO UPDATE SET alias = excluded.alias, updated_at = CURRENT_TIMESTAMP`
    )
    .run(templateName, trimmed);
}
