import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { refuse, relay } from "@/app/lib/afkar-app/library-route";
import { appMemberFor, type AppPlan } from "@/app/lib/afkar-app/person";
import { goalsPayload, planItemPayload, type AltForm, type AppDay, type AppTemplateRow, type Goals, type GoalsForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
type Plan = AppPlan & { goals: Goals | null; teen_mode: boolean };

/** Her food plan on one day: staff see the numbers even for a teen, her own screen never does. */
export async function GET(request: Request, { params }: P) {
  const auth = await requireApi("people.view");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ configured: false });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!DATE.test(date)) return refuse("BAD_REQUEST");
  const [day, plans] = await Promise.all([
    appAdmin<AppDay>(auth.user, `/admin/v1/members/${member.memberId}/day?date=${date}`),
    appAdmin<{ plans: Plan[] }>(auth.user, `/admin/v1/members/${member.memberId}/plan`)
  ]);
  if (!day.ok) return relay(day);
  if (!plans.ok) return relay(plans);
  const templates = await appAdmin<{ meal_templates: AppTemplateRow[] }>(auth.user, "/admin/v1/meal-templates");
  return NextResponse.json({ day: day.data, plans: plans.data.plans, templates: templates.ok ? templates.data.meal_templates : [] });
}

/** One line of her plan. The line must be on her day: an id alone proves nothing about whose it is. */
export async function PATCH(request: Request, { params }: P) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const b = (await request.json().catch(() => null)) as { item_id?: string; date?: string; food_id?: string; portion_id?: string; qty?: string; alternatives?: AltForm[] } | null;
  if (!b?.item_id || !DATE.test(b.date ?? "")) return refuse("BAD_REQUEST");
  const day = await appAdmin<AppDay>(auth.user, `/admin/v1/members/${member.memberId}/day?date=${b.date}`);
  if (!day.ok) return relay(day);
  if (!day.data.meals.some((meal) => meal.items.some((item) => item.id === b.item_id))) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const touched = Array.isArray(b.alternatives);
  const item = planItemPayload({ food_id: b.food_id ?? "", portion_id: b.portion_id ?? "", qty: b.qty ?? "", alternatives: touched ? b.alternatives! : [] });
  if (!item.ok) return refuse(item.error);
  // Alternatives left alone stay out: the app recounts them from the new main food, and keeps any typed by hand.
  const { alternatives, ...main } = item.body;
  return relay(await appAdmin(auth.user, `/admin/v1/plan-items/${b.item_id}`, { method: "PATCH", body: touched ? { ...main, alternatives } : main }));
}

/** Her own goals on one of her plans. */
export async function PUT(request: Request, { params }: P) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  const member = await appMemberFor(auth.user, Number((await params).id));
  if (!member.ok) return NextResponse.json({ error: member.error }, { status: member.status });
  const b = (await request.json().catch(() => null)) as { plan_id?: string; goals?: GoalsForm } | null;
  if (!b?.plan_id || !b.goals) return refuse("BAD_REQUEST");
  const goals = goalsPayload(b.goals);
  if (!goals.ok) return refuse(goals.error);
  const plans = await appAdmin<{ plans: Plan[] }>(auth.user, `/admin/v1/members/${member.memberId}/plan`);
  if (!plans.ok) return relay(plans);
  if (!plans.data.plans.some((plan) => plan.id === b.plan_id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return relay(await appAdmin(auth.user, `/admin/v1/plans/${b.plan_id}`, { method: "PATCH", body: { goals: goals.goals } }));
}
