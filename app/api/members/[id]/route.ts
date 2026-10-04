import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { deleteMember, getMember, updateMemberProfile } from "@/app/lib/db";

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
  };

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
