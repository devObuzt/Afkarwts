import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/app/lib/users/session";

const publicPrefixes = [
  "/login",
  "/privacy",
  "/terms",
  "/api/auth/login",
  "/api/webhook/whatsapp",
  // The registration form is meant to be opened by people who have no login.
  "/f",
  "/api/f",
  // The town list the public form's picker reads.
  "/api/locations",
  "/api/campaigns/tick",
  "/api/dev/simulate",
  "/api/journeys/tick",
  "/api/journeys/digest",
  "/password",
  "/api/auth/password",
  "/_next",
  "/favicon.ico"
];

function isPublicPath(pathname: string) {
  return publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Only the signature is checked here: the edge runtime cannot open
  // SQLite, so whether this account still exists, is still switched on, and
  // still holds the permission being used is read by the page or route
  // itself through requireUser.
  const isLoggedIn = Boolean(await readSession(request.cookies.get(SESSION_COOKIE)?.value));

  if (pathname === "/login" && isLoggedIn) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!.*\\..*).*)", "/api/:path*"]
};

