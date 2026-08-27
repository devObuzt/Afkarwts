import { NextResponse } from "next/server";
import { getMember, updateMemberPhone } from "@/app/lib/db";
import { alternateCountryCode } from "@/app/lib/whatsapp-errors";

export const runtime = "nodejs";

/** Switches a contact to the same subscriber number under the other country code. */
export async function POST(request: Request) {
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

  return NextResponse.json({ memberId: member.id, phone: result.phone });
}
