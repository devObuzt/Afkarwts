import { NextResponse } from "next/server";
import { addField } from "@/app/lib/forms/store";
import type { NewField } from "@/app/lib/forms/clean-template";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as NewField;

  if (!body.label?.trim()) {
    return NextResponse.json({ error: "The question needs wording." }, { status: 400 });
  }

  try {
    return NextResponse.json({ field: addField(id, body) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add the question." },
      { status: 400 }
    );
  }
}
