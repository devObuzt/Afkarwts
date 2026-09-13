import { NextResponse } from "next/server";
import { createStep, listSteps } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return NextResponse.json({ steps: listSteps(Number((await params).id)) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const templateId = Number((await params).id);
  const body = (await request.json()) as {
    week?: number;
    weekday?: number;
    sendTime?: string;
    label?: string;
    freeText?: string;
    templateName?: string;
    templateLanguage?: string;
    bodyParams?: string[];
    templatePreview?: string;
  };

  // A step without a template has no way through once the window closes.
  if (!body.templateName) {
    return NextResponse.json({ error: "لازم قالب معتمد لكل خطوة." }, { status: 400 });
  }

  const step = createStep({
    templateId,
    week: Number(body.week) || 1,
    weekday: Number(body.weekday) || 0,
    sendTime: body.sendTime || "07:00",
    label: body.label,
    freeText: body.freeText,
    templateName: body.templateName,
    templateLanguage: body.templateLanguage || "ar",
    bodyParams: body.bodyParams ?? [],
    templatePreview: body.templatePreview ?? ""
  });

  return NextResponse.json({ step });
}
