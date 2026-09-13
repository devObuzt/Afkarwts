import { NextResponse } from "next/server";
import { archiveTemplate, updateTemplate } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { name?: string; smsText?: string };
  return NextResponse.json({ template: updateTemplate(id, body) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  archiveTemplate(Number((await params).id));
  return NextResponse.json({ ok: true });
}
