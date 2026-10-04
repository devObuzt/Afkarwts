import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { listAliases, setAlias } from "@/app/lib/template-aliases";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({ aliases: listAliases() });
}

export async function POST(request: Request) {
  const auth = await requireApi("templates.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { name?: string; alias?: string };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Template name is required." }, { status: 400 });
  }

  // Only the nickname is written. The template name itself is Meta's and is
  // never changed from here.
  setAlias(body.name.trim(), body.alias ?? "");
  return NextResponse.json({ aliases: listAliases() });
}
