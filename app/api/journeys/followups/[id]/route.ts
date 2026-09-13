import { NextResponse } from "next/server";
import { resolveManual, resumeFromFollowup } from "@/app/lib/journeys/followups";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { action?: string; note?: string };

  if (body.action === "resume") {
    resumeFromFollowup(id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resolve") {
    resolveManual(id, body.note ?? "");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "إجراء غير معروف." }, { status: 400 });
}
