import { NextResponse } from "next/server";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryReader, libraryWriter, refuse, relay, UUID } from "@/app/lib/afkar-app/library-route";
import { foodPayload, type AppFood, type FoodForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await libraryReader();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return relay(await appAdmin<AppFood>(auth.user, `/admin/v1/foods/${id}`));
}

/** Edit one food. A portion keeps its id: templates, plans and logs point at it. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const form = (await request.json().catch(() => null)) as FoodForm | null;
  if (!form || !Array.isArray(form.portions)) return refuse("BAD_REQUEST");
  const food = foodPayload(form);
  if (!food.ok) return refuse(food.error, "row" in food ? food.row : undefined);
  return relay(await appAdmin<AppFood>(auth.user, `/admin/v1/foods/${id}`, { method: "PATCH", body: food.body }));
}
