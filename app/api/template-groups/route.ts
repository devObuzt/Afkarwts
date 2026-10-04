import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/app/lib/template-catalogue";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({ groups: listGroups() });
}

export async function POST(request: Request) {
  const auth = await requireApi("templates.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { name?: string };

  try {
    return NextResponse.json({ group: createGroup(body.name ?? "") });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the group." },
      { status: 400 }
    );
  }
}
