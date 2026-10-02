import { NextResponse } from "next/server";
import { createForm, listForms } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ forms: listForms() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; groupId?: number; fromTemplate?: boolean };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "The form needs a name." }, { status: 400 });
  }
  if (!body.groupId) {
    return NextResponse.json({ error: "Pick the group this form registers people into." }, { status: 400 });
  }

  try {
    const form = createForm({
      name: body.name,
      groupId: body.groupId,
      fromTemplate: body.fromTemplate !== false
    });
    return NextResponse.json({ form });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the form." },
      { status: 400 }
    );
  }
}
