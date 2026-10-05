import { getDb } from "../db";
import {
  MANAGED_AWAITING,
  MANAGED_FOLLOWING,
  MANAGED_NAME,
  isLabelKind,
  type LabelKind
} from "./kinds";

export type Label = {
  id: number;
  name: string;
  kind: LabelKind;
  colour: string;
  managed: string;
  memberCount: number;
};

type Row = Record<string, string | number | null>;

function mapLabel(row: Row): Label {
  const kind = String(row.kind ?? "other");
  return {
    id: Number(row.id),
    name: String(row.name),
    kind: isLabelKind(kind) ? kind : "other",
    colour: String(row.colour ?? ""),
    managed: String(row.managed ?? ""),
    memberCount: Number(row.member_count ?? 0)
  };
}

const SELECT = `
  SELECT groups.id, groups.name, groups.kind, groups.colour, groups.managed,
         (SELECT COUNT(*) FROM member_groups mg WHERE mg.group_id = groups.id) AS member_count
    FROM groups`;

export function listLabels(kind?: LabelKind): Label[] {
  const db = getDb();
  const rows = kind
    ? (db.prepare(`${SELECT} WHERE groups.kind = ? ORDER BY member_count DESC, groups.name`).all(kind) as Row[])
    : (db.prepare(`${SELECT} ORDER BY groups.kind, member_count DESC, groups.name`).all() as Row[]);
  return rows.map(mapLabel);
}

export function getLabel(id: number) {
  const row = getDb().prepare(`${SELECT} WHERE groups.id = ?`).get(id) as Row | undefined;
  return row ? mapLabel(row) : null;
}

export function setLabelKind(id: number, kind: LabelKind, colour = "") {
  const result = getDb().prepare("UPDATE groups SET kind = ?, colour = ? WHERE id = ?").run(kind, colour, id);
  return Number(result.changes) > 0;
}

/** A managed label is found by its role, not its name, so renaming is safe. */
export function ensureManagedLabel(managed: string) {
  const db = getDb();
  const existing = db.prepare(`${SELECT} WHERE groups.managed = ?`).get(managed) as Row | undefined;
  if (existing) {
    return mapLabel(existing);
  }

  const name = MANAGED_NAME[managed] ?? managed;
  // The name is unique, so an older hand-made label of the same name is
  // adopted rather than duplicated — Afkar's own «متابعة مسار» keeps working.
  const byName = db.prepare("SELECT id FROM groups WHERE name = ?").get(name) as { id: number } | undefined;
  if (byName) {
    db.prepare("UPDATE groups SET kind = 'state', managed = ? WHERE id = ?").run(managed, byName.id);
    return getLabel(byName.id)!;
  }

  const row = db
    .prepare("INSERT INTO groups (name, kind, managed) VALUES (?, 'state', ?) RETURNING id")
    .get(name, managed) as { id: number };
  return getLabel(row.id)!;
}

export function labelsFor(memberId: number): Array<Label & { pinned: boolean }> {
  const rows = getDb()
    .prepare(
      `SELECT groups.id, groups.name, groups.kind, groups.colour, groups.managed, mg.pinned,
              (SELECT COUNT(*) FROM member_groups m2 WHERE m2.group_id = groups.id) AS member_count
         FROM member_groups mg
         JOIN groups ON groups.id = mg.group_id
        WHERE mg.member_id = ?
        ORDER BY groups.kind, groups.name`
    )
    .all(memberId) as Row[];
  return rows.map((row) => ({ ...mapLabel(row), pinned: Number(row.pinned) === 1 }));
}

/**
 * Put a label on by hand. `pinned` records that a person decided it, which
 * is what stops the engine from taking a managed label off again.
 */
export function addLabel(memberId: number, labelId: number, byHand = true) {
  getDb()
    .prepare(
      `INSERT INTO member_groups (member_id, group_id, pinned) VALUES (?, ?, ?)
       ON CONFLICT (member_id, group_id) DO UPDATE SET pinned = MAX(pinned, excluded.pinned)`
    )
    .run(memberId, labelId, byHand ? 1 : 0);
}

export function removeLabel(memberId: number, labelId: number, byHand = true) {
  const db = getDb();

  if (!byHand) {
    // The engine never overrules a hand.
    const row = db
      .prepare("SELECT pinned FROM member_groups WHERE member_id = ? AND group_id = ?")
      .get(memberId, labelId) as { pinned: number } | undefined;
    if (!row || Number(row.pinned) === 1) {
      return false;
    }
  }

  db.prepare("DELETE FROM member_groups WHERE member_id = ? AND group_id = ?").run(memberId, labelId);
  return true;
}

export function assignCoach(memberId: number, userId: number | null) {
  const result = getDb().prepare("UPDATE members SET assigned_user_id = ? WHERE id = ?").run(userId, memberId);
  return Number(result.changes) > 0;
}

export function coachOf(memberId: number) {
  const row = getDb()
    .prepare(
      `SELECT users.id, users.name FROM members
         JOIN users ON users.id = members.assigned_user_id
        WHERE members.id = ?`
    )
    .get(memberId) as { id: number; name: string } | undefined;

  // node:sqlite hands back prototype-less rows, which a server component
  // cannot pass to a client one. Rebuilt as a plain object.
  return row ? { id: Number(row.id), name: String(row.name) } : null;
}

/**
 * The two states the system keeps current.
 *
 * «متابعة مسار» is everyone on a running path; «بانتظار أفكار» is everyone
 * whose last message was theirs. Both are recomputed rather than toggled,
 * because a state that drifts is worse than no state — and both leave
 * pinned rows alone, so a hand-placed label stays where it was put.
 */
export function syncManagedStates(now = new Date()) {
  const db = getDb();
  const following = ensureManagedLabel(MANAGED_FOLLOWING);
  const awaiting = ensureManagedLabel(MANAGED_AWAITING);

  const shouldFollow = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT e.member_id AS id FROM journey_enrollments e
             JOIN journeys j ON j.id = e.journey_id
            WHERE e.state = 'active' AND j.status = 'active'`
        )
        .all() as Array<{ id: number }>
    ).map((row) => row.id)
  );

  const shouldAwait = new Set(
    (
      db
        .prepare(
          `SELECT m.id FROM members m
             JOIN messages last ON last.id = (
               SELECT id FROM messages WHERE member_id = m.id ORDER BY created_at DESC, id DESC LIMIT 1
             )
            WHERE last.direction = 'incoming'`
        )
        .all() as Array<{ id: number }>
    ).map((row) => row.id)
  );

  let added = 0;
  let removed = 0;

  for (const [label, wanted] of [
    [following, shouldFollow],
    [awaiting, shouldAwait]
  ] as Array<[typeof following, Set<number>]>) {
    const current = new Set(
      (
        db.prepare("SELECT member_id FROM member_groups WHERE group_id = ?").all(label.id) as Array<{
          member_id: number;
        }>
      ).map((row) => row.member_id)
    );

    for (const memberId of wanted) {
      if (!current.has(memberId)) {
        addLabel(memberId, label.id, false);
        added += 1;
      }
    }

    for (const memberId of current) {
      if (!wanted.has(memberId) && removeLabel(memberId, label.id, false)) {
        removed += 1;
      }
    }
  }

  return { added, removed, at: now.toISOString() };
}
