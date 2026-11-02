import { NextResponse } from "next/server";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryWriter, relay, UUID } from "@/app/lib/afkar-app/library-route";
import type { AppFood } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";

/** A draft becomes official: only then can it enter a template or a plan. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return relay(await appAdmin<AppFood>(auth.user, `/admin/v1/foods/${id}/approve`, { method: "POST" }));
}
