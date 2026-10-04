import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { ROLES, isPermission, type Permission, type Role } from "@/app/lib/users/permissions";
import { createUser, listUsers } from "@/app/lib/users/store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("users.manage");
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({ users: listUsers() });
}

export async function POST(request: Request) {
  const auth = await requireApi("users.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    username?: string;
    password?: string;
    role?: string;
    permissions?: string[];
  };

  const role = (ROLES as readonly string[]).includes(body.role ?? "") ? (body.role as Role) : "assistant";

  const created = createUser({
    name: String(body.name ?? ""),
    username: String(body.username ?? ""),
    password: String(body.password ?? ""),
    role,
    // Undefined and empty mean different things: no list at all falls back
    // to the role's preset, an empty list is someone who may do nothing.
    permissions: Array.isArray(body.permissions)
      ? (body.permissions.filter(isPermission) as Permission[])
      : undefined
  });

  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "user.create",
    subjectType: "user",
    subjectId: created.user.id,
    subjectLabel: created.user.name,
    detail: `${role} · ${created.user.permissions.length} صلاحية`
  });

  return NextResponse.json({ user: created.user });
}
