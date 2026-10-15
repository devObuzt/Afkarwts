import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdminBytes } from "@/app/lib/afkar-app/client";
import { loadQueues } from "@/app/lib/afkar-app/queues";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/;

/** A member's photo, fetched by HeartBeat — the browser never holds the app's keys. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.view");
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  // Only a photo from someone she may see — the same rule as the queue page.
  const queues = await loadQueues(auth.user);
  if (!queues.reviews.some((review) => review.id === id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const image = await appAdminBytes(auth.user, `/admin/v1/review-requests/${id}/image`);
  if (!image.ok) return NextResponse.json({ error: "UNREACHABLE" }, { status: 502 });
  return new NextResponse(image.bytes, {
    headers: { "content-type": "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" }
  });
}
