import { NextResponse } from "next/server";
import { submitForm } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const body = (await request.json().catch(() => ({}))) as { answers?: Record<string, string> };

  const result = submitForm(token, body.answers ?? {});

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
