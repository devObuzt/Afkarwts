import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { getMember, mergeMembers } from "@/app/lib/db";

export const runtime = "nodejs";

/**
 * Join two records of the same woman. The id in the path is the one kept.
 *
 * Gated on `people.delete`: one record stops existing, and that is the
 * permission already described to its holder as irreversible. Nothing of
 * hers is lost — her messages, groups, journeys, files and registrations
 * all move across — but the record she had them under does not come back.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.delete");
  if (!auth.ok) {
    return auth.response;
  }

  const keepId = Number((await params).id);
  const body = (await request.json().catch(() => ({}))) as { dropId?: number; confirmPhone?: string };
  const dropId = Number(body.dropId);

  if (!Number.isInteger(dropId)) {
    return NextResponse.json({ error: "أي سجل نطويه؟" }, { status: 400 });
  }

  // The phone of the record being dropped has to be named, the way
  // deleting a member does: an id is a number nobody reads, and this is
  // the call that makes one of two records stop existing.
  const drop = getMember(dropId);
  if (!drop) {
    return NextResponse.json({ error: "السجل غير موجود." }, { status: 404 });
  }
  const said = String(body.confirmPhone ?? "").replace(/\D/g, "");
  if (!said || !drop.phone.replace(/\D/g, "").endsWith(said.slice(-9))) {
    return NextResponse.json({ error: "اكتب رقم السجل الذي سيُطوى للتأكيد." }, { status: 400 });
  }

  const result = mergeMembers(keepId, dropId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "member.merge",
    subjectType: "member",
    subjectId: keepId,
    subjectLabel: result.keep.name,
    detail: `طُوي السجل ${result.dropped.name} · ${result.dropped.phone}`
  });

  return NextResponse.json({ ok: true, member: result.keep });
}
