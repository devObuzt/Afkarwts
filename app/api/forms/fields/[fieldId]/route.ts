import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { archiveField, moveField, updateField } from "@/app/lib/forms/store";
import type { NewField } from "@/app/lib/forms/clean-template";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ fieldId: string }> }) {
  const auth = await requireApi("forms.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const fieldId = Number((await params).fieldId);
  const body = (await request.json()) as Partial<NewField> & { move?: "up" | "down" };

  try {
    if (body.move) {
      moveField(fieldId, body.move);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ field: updateField(fieldId, body) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the question." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ fieldId: string }> }) {
  const auth = await requireApi("forms.manage");
  if (!auth.ok) {
    return auth.response;
  }

  archiveField(Number((await params).fieldId));
  return NextResponse.json({ ok: true });
}
