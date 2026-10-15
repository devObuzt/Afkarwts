import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { deleteMember, getMember, updateMemberPhone, updateMemberProfile } from "@/app/lib/db";
import { carryPhoneToSubmissions } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  const member = getMember(Number((await params).id));

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  return NextResponse.json({ member });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    city?: string;
    notes?: string;
    service?: string;
    phone?: string;
  };

  // The phone is her identity on WhatsApp, not just a field: the journey,
  // the group and every message hang off this record, so correcting it
  // here corrects it everywhere they look. The one place that keeps its
  // own copy is her registration, and that is corrected with it — Wisam
  // asked for one number, not a number per screen.
  if (typeof body.phone === "string" && body.phone.trim()) {
    const before = getMember(id);
    let moved;
    try {
      moved = updateMemberPhone(id, body.phone);
    } catch (error) {
      return NextResponse.json(
        { error: "رقم غير صالح. اكتبيه هكذا: 05X-XXX-XXXX" },
        { status: 400 }
      );
    }
    if (!moved.ok) {
      return NextResponse.json({ error: "هذا الرقم مستعمل لمنتسبة أخرى." }, { status: 409 });
    }
    if (before) {
      carryPhoneToSubmissions(id, before.phone, moved.phone);
    }
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "member.update",
      subjectType: "member",
      subjectId: id,
      subjectLabel: before?.name ?? String(id),
      detail: `الهاتف ${before?.phone ?? "—"} ← ${moved.phone}`
    });
  }

  const member = updateMemberProfile(id, body);

  if (member) {
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "member.update",
      subjectType: "member",
      subjectId: id,
      subjectLabel: member.name,
      detail: Object.keys(body).join("، ")
    });
  }

  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  return NextResponse.json({ member });
}

/**
 * Deleting takes the contact's whole history with them, so the caller has to
 * name the phone number they mean. See deleteMember for why.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.delete");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const confirmPhone = new URL(request.url).searchParams.get("phone") ?? "";

  const result = deleteMember(id, confirmPhone);

  if (result.ok) {
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "member.delete",
      subjectType: "member",
      subjectId: id,
      subjectLabel: confirmPhone
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
