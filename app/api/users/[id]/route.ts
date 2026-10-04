import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { ROLES, isPermission, type Permission, type Role } from "@/app/lib/users/permissions";
import { getUser, setPassword, updateUser } from "@/app/lib/users/store";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("users.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const before = getUser(id);

  if (!before) {
    return NextResponse.json({ error: "المستخدم مش موجود." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    role?: string;
    permissions?: string[];
    active?: boolean;
    password?: string;
  };

  if (body.password !== undefined) {
    const result = setPassword(id, String(body.password), id !== auth.user.id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "user.password",
      subjectType: "user",
      subjectId: id,
      subjectLabel: before.name
    });
  }

  const role = (ROLES as readonly string[]).includes(body.role ?? "") ? (body.role as Role) : undefined;
  const updated = updateUser(id, {
    name: body.name,
    role,
    permissions: body.permissions ? ((body.permissions.filter(isPermission) as Permission[]) ?? []) : undefined,
    active: body.active
  });

  if (!updated.ok) {
    return NextResponse.json({ error: updated.error }, { status: 400 });
  }

  // Named one by one, so the log says what changed rather than "edited".
  const gained = updated.user.permissions.filter((item) => !before.permissions.includes(item));
  const lost = before.permissions.filter((item) => !updated.user.permissions.includes(item));
  const changes = [
    before.role !== updated.user.role ? `الدور ${before.role} ← ${updated.user.role}` : "",
    before.active !== updated.user.active ? (updated.user.active ? "شُغّل" : "انعطّل") : "",
    gained.length ? `+ ${gained.join("، ")}` : "",
    lost.length ? `− ${lost.join("، ")}` : ""
  ].filter(Boolean);

  if (changes.length) {
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "user.update",
      subjectType: "user",
      subjectId: id,
      subjectLabel: updated.user.name,
      detail: changes.join(" · ")
    });
  }

  return NextResponse.json({ user: updated.user });
}
