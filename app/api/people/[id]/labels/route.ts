import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getMember } from "@/app/lib/db";
import { recordAction } from "@/app/lib/users/audit";
import { addLabel, assignCoach, getLabel, labelsFor, removeLabel } from "@/app/lib/labels/store";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const memberId = Number((await context.params).id);
  const member = getMember(memberId);
  if (!member) {
    return NextResponse.json({ error: "المنتسب غير موجود." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    labelId?: number;
    action?: "add" | "remove";
    coachId?: number | null;
  };

  if (body.coachId !== undefined) {
    assignCoach(memberId, body.coachId === null ? null : Number(body.coachId));
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "member.update",
      subjectType: "member",
      subjectId: memberId,
      subjectLabel: member.name,
      detail: body.coachId === null ? "أُزيلت المرافِقة" : "أُسندت مرافِقة"
    });
    return NextResponse.json({ labels: labelsFor(memberId) });
  }

  const label = getLabel(Number(body.labelId));
  if (!label) {
    return NextResponse.json({ error: "الملصق غير موجود." }, { status: 404 });
  }

  // By hand, always: this route is only ever called by a person clicking.
  if (body.action === "remove") {
    removeLabel(memberId, label.id, true);
  } else {
    addLabel(memberId, label.id, true);
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "member.update",
    subjectType: "member",
    subjectId: memberId,
    subjectLabel: member.name,
    detail: `${body.action === "remove" ? "أُزيل الملصق" : "أُضيف الملصق"} «${label.name}»`
  });

  return NextResponse.json({ labels: labelsFor(memberId) });
}
