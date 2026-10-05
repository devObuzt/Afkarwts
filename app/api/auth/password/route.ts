import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { currentUser } from "@/app/lib/users/current";
import { authenticate, setPassword } from "@/app/lib/users/store";

export const runtime = "nodejs";

/** Changing your own password: the old one is the proof it is you. */
export async function POST(request: Request) {
  const user = await currentUser();

  if (!user) {
    return NextResponse.json({ error: "تسجيل الدخول مطلوب." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { current?: string; next?: string };

  if (!authenticate(user.username, String(body.current ?? ""))) {
    return NextResponse.json({ error: "كلمة السر الحالية غلط." }, { status: 400 });
  }

  if (String(body.next ?? "") === String(body.current ?? "")) {
    return NextResponse.json({ error: "لازم تكون كلمة سر جديدة." }, { status: 400 });
  }

  const result = setPassword(user.id, String(body.next ?? ""), false);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  recordAction({ userId: user.id, actor: user.name, action: "user.password", subjectLabel: "حسابه" });

  return NextResponse.json({ ok: true });
}
