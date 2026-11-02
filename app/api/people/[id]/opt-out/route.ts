import { NextResponse } from "next/server";
import { requestOptOut, undoOptOut } from "@/app/lib/members/opt-out";
import { requireUser } from "@/app/lib/users/current";

export const runtime = "nodejs";

/** الطاقم بيوقف أو يرجّع بإيده. نفس صلاحية تعديل بيانات المنتسب. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("people.edit");
  const memberId = Number((await params).id);
  if (!Number.isInteger(memberId)) {
    return NextResponse.json({ error: "منتسب غير معروف." }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }

  if (body.action === "resume") {
    const member = undoOptOut(memberId, { userId: user.id, actor: user.name });
    return NextResponse.json({ ok: Boolean(member), stopped: false });
  }

  const member = requestOptOut({
    memberId,
    source: "admin",
    byUserId: user.id,
    actor: user.name
  });
  return NextResponse.json({ ok: Boolean(member), stopped: true });
}
