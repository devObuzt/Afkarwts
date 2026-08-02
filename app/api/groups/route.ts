import { NextResponse } from "next/server";
import { createGroup, listGroups } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ groups: listGroups() });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    const group = createGroup(body.name ?? "");
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create group.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
