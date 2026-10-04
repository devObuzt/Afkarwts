import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { createTemplate, listSteps, listTemplates } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  const templates = listTemplates().map((template) => ({ ...template, steps: listSteps(template.id) }));
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const auth = await requireApi("journeys.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { name?: string; smsText?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
  }
  return NextResponse.json({ template: createTemplate({ name: body.name, smsText: body.smsText }) });
}
