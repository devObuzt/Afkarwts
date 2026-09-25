import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/app/lib/template-catalogue";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ groups: listGroups() });
}

export async function POST(request: Request) {
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
