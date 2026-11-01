import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { recordAction } from "@/app/lib/users/audit";
import { dismissDecision, restoreDecision } from "@/app/lib/decisions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as { key?: string; restore?: boolean };
  const key = (body.key ?? "").trim();

  if (!key) {
    return NextResponse.json({ error: "ما في مهمة محدّدة." }, { status: 400 });
  }

  if (body.restore) {
    restoreDecision(key);
  } else {
    dismissDecision(key, auth.user.id);
  }

  // بينكتب باللوج: التجاهل قرار، ولو ضاع إشي لازم يبيّن مين شاله من الشاشة.
  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: body.restore ? "today.restore" : "today.dismiss",
    subjectType: "decision",
    subjectId: 0,
    subjectLabel: key
  });

  return NextResponse.json({ ok: true });
}
