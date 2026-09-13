import { NextResponse } from "next/server";
import { createTemplate, listSteps, listTemplates } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function GET() {
  const templates = listTemplates().map((template) => ({ ...template, steps: listSteps(template.id) }));
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; smsText?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "الاسم مطلوب." }, { status: 400 });
  }
  return NextResponse.json({ template: createTemplate({ name: body.name, smsText: body.smsText }) });
}
