import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryWriter, refuse, relay } from "@/app/lib/afkar-app/library-route";
import { programPayload, type AppProgramFull, type ProgramForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const form = (await request.json().catch(() => null)) as ProgramForm | null;
  if (!form || !Array.isArray(form.days) || !form.goals) return refuse("BAD_REQUEST");
  const made = programPayload(form);
  if (!made.ok) return refuse(made.error, "row" in made ? made.row : undefined);
  return relay(await appAdmin<AppProgramFull>(auth.user, "/admin/v1/programs", { method: "POST", body: made.body }));
}
