import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getMember } from "@/app/lib/db";
import { recordAction } from "@/app/lib/users/audit";
import { appConfig, coachChangedEvent, deliverAppEvent } from "@/app/lib/afkar-app/client";
import { coachChangeRefusal } from "@/app/lib/afkar-app/person";
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
    const coachId = body.coachId === null ? null : Number(body.coachId);
    const refusal = coachChangeRefusal(auth.user, coachId);
    if (refusal) {
      return NextResponse.json({ error: refusal === "FORBIDDEN" ? "تغيير المرافِقة ليس من صلاحيتك." : "هذا الحساب غير متاح." }, { status: refusal === "FORBIDDEN" ? 403 : 400 });
    }
    assignCoach(memberId, coachId);
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "member.update",
      subjectType: "member",
      subjectId: memberId,
      subjectLabel: member.name,
      detail: body.coachId === null ? "أُزيلت المرافِقة" : "أُسندت مرافِقة"
    });
    // In the background, with retries: a slow or dead app must not hold HeartBeat's own screen.
    if (appConfig()) {
      void deliverAppEvent(coachChangedEvent(memberId, coachId)).then((arrived) => {
        if (!arrived) console.error("[app] coach change not delivered", memberId);
      });
    }
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
