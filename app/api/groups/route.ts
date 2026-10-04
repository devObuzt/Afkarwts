import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({ groups: listGroups() });
}

export async function POST(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as { name?: string };
    const group = createGroup(body.name ?? "");
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create group.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
