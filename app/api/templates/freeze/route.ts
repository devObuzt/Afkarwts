import { NextResponse } from "next/server";
import { setFrozen } from "@/app/lib/template-catalogue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; frozen?: boolean };

  if (!body.name) {
    return NextResponse.json({ error: "Which template?" }, { status: 400 });
  }

  setFrozen(body.name, Boolean(body.frozen));
  return NextResponse.json({ ok: true });
}
