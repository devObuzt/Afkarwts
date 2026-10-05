import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { createGroup } from "@/app/lib/db";
import { isLabelKind } from "@/app/lib/labels/kinds";
import { listLabels, setLabelKind } from "@/app/lib/labels/store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }
  return NextResponse.json({ labels: listLabels() });
}

export async function POST(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { name?: string; kind?: string };
  const name = String(body.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "اكتب اسم الملصق." }, { status: 400 });
  }

  try {
    const group = createGroup(name);
    if (isLabelKind(body.kind ?? "")) {
      setLabelKind(group.id, body.kind as never);
    }
    return NextResponse.json({ label: { ...group, kind: body.kind ?? "other" } });
  } catch {
    return NextResponse.json({ error: "يوجد ملصق بالاسم نفسه." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { id?: number; kind?: string };

  if (!Number.isInteger(body.id) || !isLabelKind(body.kind ?? "")) {
    return NextResponse.json({ error: "نوع غير معروف." }, { status: 400 });
  }

  setLabelKind(Number(body.id), body.kind as never);
  return NextResponse.json({ ok: true });
}
