import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryReader, libraryWriter, refuse, relay } from "@/app/lib/afkar-app/library-route";
import { foodPayload, type AppFood, type FoodForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";

/** Search Afkar's food library. */
export async function GET(request: Request) {
  const auth = await libraryReader();
  if (!auth.ok) return auth.response;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  return relay(await appAdmin<{ foods: AppFood[] }>(auth.user, `/admin/v1/foods${q ? `?q=${encodeURIComponent(q)}` : ""}`));
}

export async function POST(request: Request) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const form = (await request.json().catch(() => null)) as FoodForm | null;
  if (!form || !Array.isArray(form.portions)) return refuse("BAD_REQUEST");
  const food = foodPayload(form);
  if (!food.ok) return refuse(food.error, "row" in food ? food.row : undefined);
  return relay(await appAdmin<AppFood>(auth.user, "/admin/v1/foods", { method: "POST", body: food.body }));
}
