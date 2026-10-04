import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb } from "../db";
import { ROLE_PRESET, effectivePermissions, isPermission, type Permission, type Role } from "./permissions";

export type User = {
  id: number;
  name: string;
  username: string;
  role: Role;
  permissions: Permission[];
  active: boolean;
  createdAt: string;
  lastSeenAt: string | null;
  mustChangePassword: boolean;
};

type Row = Record<string, string | number | null>;

function mapUser(row: Row): User {
  const role = String(row.role) as Role;
  let stored: string[] = [];
  try {
    stored = JSON.parse(String(row.permissions ?? "[]")) as string[];
  } catch {
    stored = [];
  }

  return {
    id: Number(row.id),
    name: String(row.name),
    username: String(row.username),
    role,
    permissions: effectivePermissions(role, stored),
    active: Number(row.active) === 1,
    createdAt: String(row.created_at),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
    mustChangePassword: Number(row.must_change_password) === 1
  };
}

const COLUMNS = "id, name, username, role, permissions, active, created_at, last_seen_at, must_change_password";

/**
 * scrypt from node's own crypto — no dependency, and deliberately slow, so a
 * stolen database is not a list of passwords. The salt is per user.
 */
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expectedBytes = Buffer.from(expected, "hex");
  // Lengths differ only for a malformed row, and timingSafeEqual throws then.
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

/** Usernames are matched without case or surrounding space. */
export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function listUsers(): User[] {
  return (
    getDb().prepare(`SELECT ${COLUMNS} FROM users ORDER BY active DESC, name`).all() as Row[]
  ).map(mapUser);
}

export function getUser(id: number) {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id) as Row | undefined;
  return row ? mapUser(row) : null;
}

export function findByUsername(username: string) {
  const row = getDb()
    .prepare(`SELECT ${COLUMNS} FROM users WHERE username = ?`)
    .get(normalizeUsername(username)) as Row | undefined;
  return row ? mapUser(row) : null;
}

export function countUsers() {
  return Number((getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n);
}

export function createUser(input: {
  name: string;
  username: string;
  password: string;
  role: Role;
  permissions?: Permission[];
  mustChangePassword?: boolean;
}) {
  const username = normalizeUsername(input.username);

  if (!username || !/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false as const, error: "اسم المستخدم بالإنجليزي، 3 حروف وفوق، بلا مسافات." };
  }

  if (input.password.length < 8) {
    return { ok: false as const, error: "كلمة السر لازم تكون 8 خانات وفوق." };
  }

  if (findByUsername(username)) {
    return { ok: false as const, error: "في مستخدم بنفس الاسم." };
  }

  const permissions = (input.permissions ?? ROLE_PRESET[input.role]).filter(isPermission);

  const row = getDb()
    .prepare(
      `INSERT INTO users (name, username, password_hash, role, permissions, active, must_change_password)
       VALUES (?, ?, ?, ?, ?, 1, ?) RETURNING ${COLUMNS}`
    )
    .get(
      input.name.trim() || username,
      username,
      hashPassword(input.password),
      input.role,
      JSON.stringify(permissions),
      input.mustChangePassword === false ? 0 : 1
    ) as Row;

  return { ok: true as const, user: mapUser(row) };
}

export function authenticate(username: string, password: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT id, password_hash, active FROM users WHERE username = ?")
    .get(normalizeUsername(username)) as { id: number; password_hash: string; active: number } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    return null;
  }

  // A switched-off account fails the same way a wrong password does, so the
  // login screen cannot be used to find out who exists here.
  if (Number(row.active) !== 1) {
    return null;
  }

  return getUser(row.id);
}

export function updateUser(
  id: number,
  patch: { name?: string; role?: Role; permissions?: Permission[]; active?: boolean }
) {
  const user = getUser(id);
  if (!user) {
    return { ok: false as const, error: "المستخدم مش موجود." };
  }

  // The last owner standing cannot be switched off or demoted — otherwise
  // nobody is left who can put it back.
  const losingOwner = (patch.role && patch.role !== "owner") || patch.active === false;
  if (user.role === "owner" && losingOwner && countActiveOwners() <= 1) {
    return { ok: false as const, error: "هاي آخر مالكة شغّالة — لازم تضلّ وحدة على الأقل." };
  }

  const db = getDb();
  db.prepare("UPDATE users SET name = ?, role = ?, permissions = ?, active = ? WHERE id = ?").run(
    patch.name?.trim() || user.name,
    patch.role ?? user.role,
    JSON.stringify((patch.permissions ?? user.permissions).filter(isPermission)),
    patch.active === undefined ? (user.active ? 1 : 0) : patch.active ? 1 : 0,
    id
  );

  return { ok: true as const, user: getUser(id)! };
}

export function countActiveOwners() {
  return Number(
    (getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND active = 1").get() as { n: number }).n
  );
}

export function setPassword(id: number, password: string, mustChange = false) {
  if (password.length < 8) {
    return { ok: false as const, error: "كلمة السر لازم تكون 8 خانات وفوق." };
  }

  const result = getDb()
    .prepare("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?")
    .run(hashPassword(password), mustChange ? 1 : 0, id);

  if (Number(result.changes) === 0) {
    return { ok: false as const, error: "المستخدم مش موجود." };
  }

  return { ok: true as const };
}

export function touchUser(id: number) {
  getDb().prepare("UPDATE users SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
}
