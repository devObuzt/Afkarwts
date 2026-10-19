import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getMember, updateMemberPhone } from "@/app/lib/db";
import { alternateCountryCode } from "@/app/lib/whatsapp-errors";
import { reviveAfterPhoneFix } from "@/app/lib/journeys/phone-fix";

export const runtime = "nodejs";

/** Switches a contact to the same subscriber number under the other country code. */
export async function POST(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { memberId?: number; phone?: string };
  const member = getMember(Number(body.memberId));
  if (!member) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const phone = body.phone ?? alternateCountryCode(member.phone);
  if (!phone) {
    return NextResponse.json({ error: "This number has no +970/+972 alternative." }, { status: 400 });
  }

  const result = updateMemberPhone(member.id, phone);
  if (!result.ok) {
    return NextResponse.json(
      { error: "Another contact already uses that number." },
      { status: 409 }
    );
  }

  // This route exists because the number was wrong, so the same rule
  // applies as on the member's own file: ask again for everything the old
  // number was refused.
  const revived = reviveAfterPhoneFix(member.id);

  return NextResponse.json({ memberId: member.id, phone: result.phone, revived });
}
