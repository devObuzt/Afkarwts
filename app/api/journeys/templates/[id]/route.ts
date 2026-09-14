import { NextResponse } from "next/server";
import { archiveTemplate, liveJourneysUsingTemplate, updateTemplate } from "@/app/lib/journeys/store";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { name?: string; smsText?: string };
  return NextResponse.json({ template: updateTemplate(id, body) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);

  // Removing a path out from under a running journey would leave it with
  // nothing to send, so the journey has to be finished or paused first.
  const inUse = liveJourneysUsingTemplate(id);
  if (inUse.length) {
    const where = inUse.map((item) => `${item.groupName} (${item.status})`).join(", ");
    return NextResponse.json(
      { error: `This path is still in use by ${where}. Finish or remove the journey first.` },
      { status: 409 }
    );
  }

  archiveTemplate(id);
  return NextResponse.json({ ok: true });
}
