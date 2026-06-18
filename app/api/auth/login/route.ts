import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, getAdminConfig, isAuthConfigured } from "@/app/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json({ error: "Admin credentials are not configured." }, { status: 500 });
  }

  const body = (await request.json()) as { username?: string; password?: string };
  const config = getAdminConfig();

  if (body.username !== config.username || body.password !== config.password) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
  return response;
}

