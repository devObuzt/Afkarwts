import { NextResponse } from "next/server";
import { AUTH_COOKIE } from "@/app/lib/auth";
import { recordAction } from "@/app/lib/users/audit";
import { currentUser } from "@/app/lib/users/current";
import { SESSION_COOKIE } from "@/app/lib/users/session";

export const runtime = "nodejs";

export async function POST() {
  const user = await currentUser();
  if (user) {
    recordAction({ userId: user.id, actor: user.name, action: "session.logout" });
  }

  const response = NextResponse.json({ ok: true });
  for (const cookie of [SESSION_COOKIE, AUTH_COOKIE]) {
    response.cookies.set(cookie, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0
    });
  }
  return response;
}
