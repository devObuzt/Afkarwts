import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { approvePayload, canHandleProducts } from "@/app/lib/afkar-app/queues";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/;

/** Afkar checked the values: the product joins the library with its barcode, and whoever scanned it is told. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!canHandleProducts(auth.user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const form = approvePayload((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });
  const result = await appAdmin(auth.user, `/admin/v1/product-requests/${id}/approve`, { method: "POST", body: form.body });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status === 404 ? 404 : 502 });
  return NextResponse.json({ ok: true });
}
