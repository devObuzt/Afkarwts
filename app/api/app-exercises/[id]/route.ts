import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/;

/** Archive (or bring back) one of Afkar's exercises. Plans and logs that used it keep it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  if (!canHandleProducts(auth.user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const b = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (typeof b.archived !== "boolean") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const done = await appAdmin(auth.user, `/admin/v1/exercises/${id}`, { method: "PATCH", body: { archived: b.archived } });
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status === 404 ? 404 : 502 });
  return NextResponse.json({ ok: true });
}
