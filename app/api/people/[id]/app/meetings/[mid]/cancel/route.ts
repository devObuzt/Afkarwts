import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { appMemberFor } from "@/app/lib/afkar-app/person";
import type { AppMeeting } from "@/app/lib/afkar-app/training";

export const runtime = "nodejs";

/** Cancels one of HER meetings — the id must be in her list, not just any meeting this user can reach. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  const { id, mid } = await params;
  const member = await appMemberFor(auth.user, Number(id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const list = await appAdmin<{ meetings: AppMeeting[] }>(auth.user, `/admin/v1/members/${member.memberId}/meetings`);
  if (!list.ok) return NextResponse.json({ error: "UNREACHABLE" }, { status: 502 });
  if (!list.data.meetings.some((m) => m.id === mid && m.status === "scheduled")) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const done = await appAdmin(auth.user, `/admin/v1/meetings/${mid}/cancel`, { method: "POST" });
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status === 404 ? 404 : 502 });
  return NextResponse.json({ ok: true });
}
