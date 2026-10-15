import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/;

/** Not a product for the library. The app won't look this barcode up or queue it again. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!canHandleProducts(auth.user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const result = await appAdmin(auth.user, `/admin/v1/product-requests/${id}/reject`, { method: "POST" });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status === 404 ? 404 : 502 });
  return NextResponse.json({ ok: true });
}
