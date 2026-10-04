import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { archiveStep, updateStep } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const body = (await request.json()) as Record<string, unknown>;
  return NextResponse.json({ step: updateStep(id, body) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

  archiveStep(Number((await params).id));
  return NextResponse.json({ ok: true });
}
