import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { whoOnStep } from "@/app/lib/journeys/report";

export const runtime = "nodejs";

/** The names behind one number on the journey report. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const stepParam = url.searchParams.get("step");
  const rows = whoOnStep(
    Number((await params).id),
    stepParam ? Number(stepParam) : null,
    url.searchParams.get("bucket") ?? ""
  );

  return NextResponse.json({ rows });
}
