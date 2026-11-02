import { NextResponse } from "next/server";
import { appAdmin } from "@/app/lib/afkar-app/client";
import { libraryReader, libraryWriter, refuse, relay, UUID } from "@/app/lib/afkar-app/library-route";
import { programPayload, type AppProgramFull, type ProgramForm } from "@/app/lib/afkar-app/nutrition";

export const runtime = "nodejs";
type P = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: P) {
  const auth = await libraryReader();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return relay(await appAdmin<AppProgramFull>(auth.user, `/admin/v1/programs/${id}`));
}

/** Who is already on this program keeps the copy she got; this reaches whoever joins next. */
export async function PUT(request: Request, { params }: P) {
  const auth = await libraryWriter();
  if (!auth.ok) return auth.response;
  const id = (await params).id;
  if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const form = (await request.json().catch(() => null)) as ProgramForm | null;
  if (!form || !Array.isArray(form.days) || !form.goals) return refuse("BAD_REQUEST");
  const made = programPayload(form);
  if (!made.ok) return refuse(made.error, "row" in made ? made.row : undefined);
  return relay(await appAdmin<AppProgramFull>(auth.user, `/admin/v1/programs/${id}`, { method: "PUT", body: made.body }));
}
