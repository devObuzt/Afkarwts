import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getPersonRecord } from "@/app/lib/people";
import { can } from "@/app/lib/users/permissions";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  const record = getPersonRecord(Number((await params).id), { health: can(auth.user, "people.health") });

  if (!record) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(record);
}
