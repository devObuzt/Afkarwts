import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { getPersonRecord } from "@/app/lib/people";
import { appConfig, enrollmentEvent, sendAppEvent } from "@/app/lib/afkar-app/client";
import { appPersonView, appPrograms, canActOnPerson } from "@/app/lib/afkar-app/person";

export const runtime = "nodejs";

type P = { params: Promise<{ id: string }> };

/** Her account in the member app, her plans there, and the tracks she could be put on. */
export async function GET(_request: Request, { params }: P) {
  const auth = await requireApi("people.view");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ configured: false });

  const personId = Number((await params).id);
  if (!canActOnPerson(auth.user, personId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const [view, programs] = await Promise.all([appPersonView(auth.user, personId), appPrograms(auth.user)]);
  if (!view.ok) return NextResponse.json({ configured: true, error: view.error }, { status: 502 });
  return NextResponse.json({
    configured: true,
    member: view.data.member,
    plans: view.data.plans,
    programs: programs.ok ? programs.data : []
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Puts her on a track in the app. The app creates her account from the phone if she has none yet. */
export async function POST(request: Request, { params }: P) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });

  const body = (await request.json().catch(() => null)) as { program_key?: unknown; starts_on?: unknown } | null;
  const programKey = typeof body?.program_key === "string" ? body.program_key.trim() : "";
  const startsOn = typeof body?.starts_on === "string" ? body.starts_on : "";
  if (!programKey || !DATE.test(startsOn) || Number.isNaN(Date.parse(startsOn))) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const personId = Number((await params).id);
  if (!canActOnPerson(auth.user, personId)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const record = getPersonRecord(personId, { health: false });
  if (!record) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (!record.member.phone) return NextResponse.json({ error: "NO_PHONE" }, { status: 422 });

  const sent = await sendAppEvent(
    enrollmentEvent(
      { id: record.member.id, name: record.member.name, phone: record.member.phone },
      { programKey, startsOn, coachUserId: record.coach?.id ?? null }
    )
  );
  if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status === 422 ? 422 : 502 });
  return NextResponse.json({ ok: true });
}
