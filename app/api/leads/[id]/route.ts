import { recordAction } from "@/app/lib/users/audit";
import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { approveSubmission, rejectSubmission } from "@/app/lib/forms/approve";
import { getSubmission } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("leads.review");
  if (!auth.ok) {
    return auth.response;
  }

  const stored = getSubmission(Number((await params).id));

  if (!stored) {
    return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  }

  return NextResponse.json(stored);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("leads.review");
  if (!auth.ok) {
    return auth.response;
  }

  const id = Number((await params).id);
  const body = (await request.json()) as { action?: string; overwrite?: boolean };

  if (body.action === "reject") {
    rejectSubmission(id);
    recordAction({
      userId: auth.user.id,
      actor: auth.user.name,
      action: "lead.reject",
      subjectType: "submission",
      subjectId: id,
      subjectLabel: getSubmission(id)?.submission.name ?? ""
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "approve") {
    const name = getSubmission(id)?.submission.name ?? "";
    const result = approveSubmission(id, { overwrite: body.overwrite });
    if (result.ok) {
      recordAction({
        userId: auth.user.id,
        actor: auth.user.name,
        action: "lead.approve",
        subjectType: "submission",
        subjectId: id,
        subjectLabel: name,
        detail: body.overwrite ? "مع تحديث بياناته" : ""
      });
    }
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
