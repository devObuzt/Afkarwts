import { NextResponse } from "next/server";
import { deleteForm, getForm, listFields, setFormStatus, updateForm } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const form = getForm(id);

  if (!form) {
    return NextResponse.json({ error: "Form not found." }, { status: 404 });
  }

  return NextResponse.json({ form, fields: listFields(id) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const body = (await request.json()) as { name?: string; intro?: string; status?: "open" | "closed" };

  try {
    if (body.status) {
      setFormStatus(id, body.status);
    }
    if (body.name !== undefined || body.intro !== undefined) {
      updateForm(id, { name: body.name, intro: body.intro });
    }
    return NextResponse.json({ form: getForm(id) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update the form." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  deleteForm(Number((await params).id));
  return NextResponse.json({ ok: true });
}
