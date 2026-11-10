import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { setOptOutLine } from "@/app/lib/template-catalogue";
import { recordAction } from "@/app/lib/users/audit";

export const runtime = "nodejs";

/** إلغاء سطر الإيقاف عن قالب قرار — فبينكتب باللوج باسم اللي عمله. */
export async function POST(request: Request) {
  const auth = await requireApi("templates.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { name?: string; wanted?: boolean };
  if (!body.name) {
    return NextResponse.json({ error: "أي قالب؟" }, { status: 400 });
  }

  const wanted = Boolean(body.wanted);
  setOptOutLine(body.name, wanted);
  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "template.optoutline",
    subjectType: "template",
    subjectId: body.name,
    subjectLabel: body.name,
    detail: wanted ? "سطر إيقاف الرسائل مطلوب" : "سطر إيقاف الرسائل ملغى عن هذا القالب"
  });
  return NextResponse.json({ ok: true, wanted });
}
