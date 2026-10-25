import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { isLabelKind } from "@/app/lib/labels/kinds";
import { getLabel, setLabelKind } from "@/app/lib/labels/store";

export const runtime = "nodejs";

/** The kind a label belongs to, and the colour it is drawn in. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const label = Number.isInteger(id) ? getLabel(id) : null;
  if (!label) {
    return NextResponse.json({ error: "الملصق غير موجود." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { kind?: string; colour?: string };
  const kind = isLabelKind(body.kind ?? "") ? (body.kind as never) : label.kind;

  // Only a real colour reaches the column: the chip falls back to the one
  // derived from the name, and a stored «red» would break that quietly.
  const colour = String(body.colour ?? "").trim();
  if (colour && !/^#[0-9a-fA-F]{6}$/.test(colour)) {
    return NextResponse.json({ error: "اللون لازم يكون بصيغة #RRGGBB." }, { status: 400 });
  }

  setLabelKind(id, kind, colour);

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "member.update",
    subjectType: "member",
    subjectId: 0,
    subjectLabel: `ملصق ${label.name}`,
    detail: `${label.kind}${colour ? ` · ${colour}` : ""}`
  });

  return NextResponse.json({ label: getLabel(id) });
}
