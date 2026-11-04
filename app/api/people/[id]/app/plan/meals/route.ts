import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { refuse, relay, UUID } from "@/app/lib/afkar-app/library-route";
import { appMemberFor, type AppPlan } from "@/app/lib/afkar-app/person";
import { planMealPayload, type AppDay, type Text } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };
type Body = { date?: string; meal_id?: string; template_id?: string; time?: string; note?: string; note_text?: Text | null };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Who may act on her, and the day being edited: an id from the browser only counts if it is on that day. */
async function herDay(request: Request, personId: number) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!appConfig()) return { ok: false as const, response: NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 }) };
  const member = await appMemberFor(auth.user, personId);
  if (!member.ok) return { ok: false as const, response: NextResponse.json({ error: member.error }, { status: member.status }) };
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || !DATE.test(body.date ?? "")) return { ok: false as const, response: refuse("BAD_REQUEST") };
  const day = await appAdmin<AppDay>(auth.user, `/admin/v1/members/${member.memberId}/day?date=${body.date}`);
  if (!day.ok) return { ok: false as const, response: relay(day) };
  return { ok: true as const, user: auth.user, memberId: member.memberId, body, day: day.data };
}

const onDay = (day: AppDay, mealId?: string) => Boolean(mealId && UUID.test(mealId) && day.meals.some((m) => m.id === mealId));

/** A meal from a template, into the day of her cycle being looked at. */
export async function POST(request: Request, { params }: P) {
  const her = await herDay(request, Number((await params).id));
  if (!her.ok) return her.response;
  if (!UUID.test(her.body.template_id ?? "") || her.day.status !== "active" || her.day.cycle_day === undefined) return refuse("BAD_REQUEST");
  const plans = await appAdmin<{ plans: AppPlan[] }>(her.user, `/admin/v1/members/${her.memberId}/plan`);
  if (!plans.ok) return relay(plans);
  const plan = plans.data.plans.find((p) => p.program_key === her.day.program?.key && p.starts_on === her.day.starts_on);
  if (!plan) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return relay(await appAdmin(her.user, `/admin/v1/plans/${plan.id}/meals`, { method: "POST", body: { template_id: her.body.template_id, cycle_day: her.day.cycle_day } }));
}

export async function PATCH(request: Request, { params }: P) {
  const her = await herDay(request, Number((await params).id));
  if (!her.ok) return her.response;
  if (!onDay(her.day, her.body.meal_id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const meal = planMealPayload({ time: her.body.time ?? "", note: her.body.note ?? "", note_text: her.body.note_text });
  if (!meal.ok) return refuse(meal.error);
  return relay(await appAdmin(her.user, `/admin/v1/plan-meals/${her.body.meal_id}`, { method: "PATCH", body: meal.body }));
}

export async function DELETE(request: Request, { params }: P) {
  const her = await herDay(request, Number((await params).id));
  if (!her.ok) return her.response;
  if (!onDay(her.day, her.body.meal_id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return relay(await appAdmin(her.user, `/admin/v1/plan-meals/${her.body.meal_id}`, { method: "DELETE" }));
}
