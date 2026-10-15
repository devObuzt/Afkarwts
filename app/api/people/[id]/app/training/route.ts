import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { appMemberFor } from "@/app/lib/afkar-app/person";
import { planPayload, type AppExercise, type AppPlanItem, type AppWorkoutLog } from "@/app/lib/afkar-app/training";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };
type Training = { plan: AppPlanItem[]; logs: AppWorkoutLog[] };

/** Her training plan in the app, the last two weeks of what she did, and the library to build from. */
export async function GET(_request: Request, { params }: P) {
  const auth = await requireApi("people.view");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ configured: false });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const [training, library] = await Promise.all([
    appAdmin<Training>(auth.user, `/admin/v1/members/${member.memberId}/training`),
    appAdmin<{ exercises: AppExercise[] }>(auth.user, "/admin/v1/exercises")
  ]);
  if (!training.ok || !library.ok) return NextResponse.json({ error: "UNREACHABLE" }, { status: 502 });
  return NextResponse.json({ ...training.data, exercises: library.data.exercises.filter((e) => !e.archived) });
}

/** The whole plan, replaced. Rows are checked here against how each exercise is counted, then again by the app. */
export async function PUT(request: Request, { params }: P) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });

  const body = (await request.json().catch(() => null)) as { rows?: unknown } | null;
  if (!Array.isArray(body?.rows) || body.rows.length > 30) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  const [library, current] = await Promise.all([
    appAdmin<{ exercises: AppExercise[] }>(auth.user, "/admin/v1/exercises"),
    appAdmin<Training>(auth.user, `/admin/v1/members/${member.memberId}/training`)
  ]);
  if (!library.ok || !current.ok) return NextResponse.json({ error: "UNREACHABLE" }, { status: 502 });
  // Afkar's exercises, plus any of hers already in the plan (a member's own exercise can stay there).
  const unitOf = new Map<string, string>([
    ...library.data.exercises.map((e) => [e.id, e.unit] as [string, string]),
    ...current.data.plan.map((p) => [p.exercise.id, p.exercise.unit] as [string, string])
  ]);
  const rows = (body.rows as Array<Record<string, unknown>>).map((r) => ({
    exercise_id: String(r.exercise_id ?? ""), sets: String(r.sets ?? ""), reps: String(r.reps ?? ""), minutes: String(r.minutes ?? ""),
    weekdays: Array.isArray(r.weekdays) ? r.weekdays.map(Number) : [], note: String(r.note ?? "")
  }));
  const plan = planPayload(rows, unitOf);
  if (!plan.ok) return NextResponse.json({ error: plan.error, row: plan.row }, { status: 400 });
  const saved = await appAdmin<{ plan: AppPlanItem[] }>(auth.user, `/admin/v1/members/${member.memberId}/training`, { method: "PUT", body: { items: plan.items } });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status === 400 ? 400 : 502 });
  return NextResponse.json(saved.data);
}
