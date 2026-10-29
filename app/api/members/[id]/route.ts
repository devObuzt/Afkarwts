import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getMember, updateMemberPhone, updateMemberProfile } from "@/app/lib/db";
import { eraseMember } from "@/app/lib/members/erase";
import { carryPhoneToSubmissions } from "@/app/lib/forms/store";
import { reviveAfterPhoneFix } from "@/app/lib/journeys/phone-fix";

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
  let revived: { resumed: number; owed: number; sms: number } | null = null;
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
    // Everything the old number was refused is asked again. Without this a
    // typo takes her off the path for good: the number is corrected, her
    // free text works, and the course runs without her.
    revived = reviveAfterPhoneFix(id);
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

  return NextResponse.json(revived ? { member, revived } : { member });
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

  const result = eraseMember(id, confirmPhone);

  if (result.ok) {
    // The row is gone, so the log is the only place her name survives — and
    // what it cost, because «حُذف منتسب» alone does not say what was lost.
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "member.delete",
      subjectType: "member",
      subjectId: id,
      subjectLabel: `${result.name || "بلا اسم"} · ${result.phone}`,
      // صيغة «اسم: رقم» بالمقصود: «2 رسالة» غلط عربي و«رسالتان» بتجبر
      // الخادم يعرف قواعد المثنى. اللوج بدّه الأرقام مش الصياغة.
      detail: [
        `رسائل: ${result.messages}`,
        result.files ? `ملفات: ${result.files}` : "",
        result.payments ? `دفعات فُكّ ربطها: ${result.payments}` : ""
      ]
        .filter(Boolean)
        .join(" · ")
    });
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
