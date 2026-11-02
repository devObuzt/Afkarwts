import { NextResponse } from "next/server";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryReader, libraryWriter, refuse, relay, UUID } from "@/app/lib/afkar-app/library-route";
import { templatePayload, type AppFood, type AppTemplate, type TemplateForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

/** One template, with the foods it names — the template itself only holds their ids. */
export async function GET(_request: Request, { params }: P) {
  const auth = await libraryReader();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const template = await appAdmin<AppTemplate>(auth.user, `/admin/v1/meal-templates/${id}`);
  if (!template.ok) return relay(template);
  const ids = [...new Set(template.data.slots.flatMap((s) => [s.food_id, ...s.alternatives.map((a) => a.food_id)]))];
  const foods = await Promise.all(ids.map((food) => appAdmin<AppFood>(auth.user, `/admin/v1/foods/${food}`)));
  const failed = foods.find((f) => !f.ok);
  if (failed && !failed.ok) return relay(failed);
  return NextResponse.json({ template: template.data, foods: foods.flatMap((f) => (f.ok ? [f.data] : [])) });
}

export async function PUT(request: Request, { params }: P) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const form = (await request.json().catch(() => null)) as TemplateForm | null;
  if (!form || !Array.isArray(form.slots)) return refuse("BAD_REQUEST");
  const made = templatePayload(form);
  if (!made.ok) return refuse(made.error, "row" in made ? made.row : undefined);
  return relay(await appAdmin<AppTemplate>(auth.user, `/admin/v1/meal-templates/${id}`, { method: "PUT", body: made.body }));
}
