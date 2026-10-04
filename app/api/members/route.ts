import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import "@/app/lib/scheduler";
import { createMember, listMembers } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  return NextResponse.json({ members: listMembers() });
}

export async function POST(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as { name?: string; phone?: string; notes?: string };
    const member = createMember({
      name: body.name ?? "",
      phone: body.phone ?? "",
      notes: body.notes ?? ""
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create member.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

