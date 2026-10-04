import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/app/lib/auth";
import { recordAction } from "@/app/lib/users/audit";
import { bootstrapOwner } from "@/app/lib/users/bootstrap";
import { SESSION_COOKIE, SESSION_DAYS, signSession } from "@/app/lib/users/session";
import { authenticate, touchUser } from "@/app/lib/users/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "اكتب اسم المستخدم وكلمة السر." }, { status: 400 });
  }

  // The first login with the old shared credentials turns them into the
  // owner's account, so there is one door rather than two.
  const user = authenticate(username, password) ?? bootstrapOwner(username, password);

  if (!user) {
    recordAction({ userId: null, actor: username, action: "session.failed" });
    return NextResponse.json({ error: "اسم المستخدم أو كلمة السر غلط." }, { status: 401 });
  }

  touchUser(user.id);
  recordAction({ userId: user.id, actor: user.name, action: "session.login" });

  const response = NextResponse.json({
    ok: true,
    user: { name: user.name, role: user.role, mustChangePassword: user.mustChangePassword }
  });

  response.cookies.set(SESSION_COOKIE, await signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60
  });

  // The old shared cookie is cleared, so one browser cannot keep both.
  response.cookies.set(AUTH_COOKIE, "", { path: "/", maxAge: 0 });

  return response;
}
