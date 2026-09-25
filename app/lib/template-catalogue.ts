import { getDb } from "./db";

/**
 * Everything Afkar keeps about a Meta template that Meta itself does not hold:
 * the internal name, whether it is frozen, and which groups it belongs to.
 *
 * Freezing is ours alone. The template stays approved at Meta and any journey
 * already using it keeps working — it simply stops being offered when someone
 * builds a new step, which is what "retired" means in practice. Deleting at
 * Meta is deliberately not offered: the name cannot be reused for 30 days and
 * every running path on it would break.
 */

export type TemplateGroup = { id: number; name: string; templateNames: string[] };

function ensureRow(templateName: string) {
  getDb()
    .prepare("INSERT INTO template_aliases (template_name, alias) VALUES (?, '') ON CONFLICT (template_name) DO NOTHING")
    .run(templateName);
}

export function listFrozen(): string[] {
  const rows = getDb()
    .prepare("SELECT template_name FROM template_aliases WHERE frozen_at IS NOT NULL")
    .all() as Array<{ template_name: string }>;
  return rows.map((row) => row.template_name);
}

export function setFrozen(templateName: string, frozen: boolean) {
  ensureRow(templateName);
  getDb()
    .prepare("UPDATE template_aliases SET frozen_at = ? WHERE template_name = ?")
    .run(frozen ? new Date().toISOString() : null, templateName);
}

export function listGroups(): TemplateGroup[] {
  const groups = getDb().prepare("SELECT id, name FROM template_groups ORDER BY name").all() as Array<{
    id: number;
    name: string;
  }>;
  const items = getDb().prepare("SELECT group_id, template_name FROM template_group_items").all() as Array<{
    group_id: number;
    template_name: string;
  }>;

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    templateNames: items.filter((item) => item.group_id === group.id).map((item) => item.template_name)
  }));
}

export function createGroup(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("A group needs a name.");
  }
  getDb().prepare("INSERT INTO template_groups (name) VALUES (?) ON CONFLICT (name) DO NOTHING").run(trimmed);
  return getDb().prepare("SELECT id, name FROM template_groups WHERE name = ?").get(trimmed) as {
    id: number;
    name: string;
  };
}

export function renameGroup(id: number, name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("A group needs a name.");
  }
  getDb().prepare("UPDATE template_groups SET name = ? WHERE id = ?").run(trimmed, id);
}

export function deleteGroup(id: number) {
  getDb().prepare("DELETE FROM template_group_items WHERE group_id = ?").run(id);
  getDb().prepare("DELETE FROM template_groups WHERE id = ?").run(id);
}

/** A template can sit in several groups; assigning the same one twice is a no-op. */
export function assignToGroup(groupId: number, templateName: string) {
  getDb()
    .prepare("INSERT INTO template_group_items (group_id, template_name) VALUES (?, ?) ON CONFLICT DO NOTHING")
    .run(groupId, templateName);
}

export function removeFromGroup(groupId: number, templateName: string) {
  getDb()
    .prepare("DELETE FROM template_group_items WHERE group_id = ? AND template_name = ?")
    .run(groupId, templateName);
}
