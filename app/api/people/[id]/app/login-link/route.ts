import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { appPersonView } from "@/app/lib/afkar-app/person";

export const runtime = "nodejs";

/** A one-time sign-in link for her app account — for when the code never reaches her phone. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });

  const view = await appPersonView(auth.user, Number((await params).id));
  if (!view.ok) return NextResponse.json({ error: view.error }, { status: 502 });
  if (!view.data.member) return NextResponse.json({ error: "NO_APP_ACCOUNT" }, { status: 404 });

  const link = await appAdmin<{ url: string; expires_at: string }>(auth.user, `/admin/v1/members/${view.data.member.id}/login-link`, {
    method: "POST"
  });
  if (!link.ok) return NextResponse.json({ error: link.error }, { status: 502 });
  return NextResponse.json(link.data);
}
