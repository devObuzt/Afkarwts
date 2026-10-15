import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { loadQueues, resolvePayload } from "@/app/lib/afkar-app/queues";

export const runtime = "nodejs";

/** Afkar handled the photo; the app sends the member a message worded by the outcome. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  const body = resolvePayload((await request.json().catch(() => ({}))) as Record<string, unknown>);
  if (!body) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const queues = await loadQueues(auth.user);
  if (!queues.reviews.some((review) => review.id === id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const result = await appAdmin(auth.user, `/admin/v1/review-requests/${id}/resolve`, { method: "POST", body });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status === 404 ? 404 : 502 });
  return NextResponse.json({ ok: true });
}
