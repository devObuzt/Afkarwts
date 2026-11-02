import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryWriter, refuse, relay } from "@/app/lib/afkar-app/library-route";
import { templatePayload, type AppTemplate, type TemplateForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const form = (await request.json().catch(() => null)) as TemplateForm | null;
  if (!form || !Array.isArray(form.slots)) return refuse("BAD_REQUEST");
  const made = templatePayload(form);
  if (!made.ok) return refuse(made.error, "row" in made ? made.row : undefined);
  return relay(await appAdmin<AppTemplate>(auth.user, "/admin/v1/meal-templates", { method: "POST", body: made.body }));
}
