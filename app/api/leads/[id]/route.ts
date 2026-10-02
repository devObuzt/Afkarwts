import { NextResponse } from "next/server";
import { approveSubmission, rejectSubmission } from "@/app/lib/forms/approve";
import { getSubmission } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const stored = getSubmission(Number((await params).id));

  if (!stored) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  return NextResponse.json(stored);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { action?: string; overwrite?: boolean };

  if (body.action === "reject") {
    rejectSubmission(id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve") {
    const result = approveSubmission(id, { overwrite: body.overwrite });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
