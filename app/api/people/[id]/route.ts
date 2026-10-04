import { NextResponse } from "next/server";
import { getPersonRecord } from "@/app/lib/people";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const record = getPersonRecord(Number((await params).id));

  if (!record) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json(record);
}
