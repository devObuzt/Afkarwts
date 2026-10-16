import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { appMemberFor } from "@/app/lib/afkar-app/person";
import { meetingPayload, type AppMeeting } from "@/app/lib/afkar-app/training";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

/** Her meetings in the app, cancelled ones included — the team sees what she was told. */
export async function GET(_request: Request, { params }: P) {
  const auth = await requireApi("people.view");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ configured: false });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const list = await appAdmin<{ meetings: AppMeeting[] }>(auth.user, `/admin/v1/members/${member.memberId}/meetings`);
  if (!list.ok) return NextResponse.json({ error: "UNREACHABLE" }, { status: 502 });
  return NextResponse.json(list.data);
}

/** A meeting with her: it shows in her app and she's told. The date and time are Israel's. */
export async function POST(request: Request, { params }: P) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  const form = meetingPayload(((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>);
  if (!form.ok) return NextResponse.json({ error: form.error }, { status: 400 });
  if (Date.parse(form.body.starts_at) < Date.now()) return NextResponse.json({ error: "PAST" }, { status: 400 });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const made = await appAdmin<AppMeeting>(auth.user, `/admin/v1/members/${member.memberId}/meetings`, { method: "POST", body: form.body });
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status === 400 ? 400 : 502 });
  return NextResponse.json(made.data, { status: 201 }); // 200 from the app = the same form sent again; still a success
}
