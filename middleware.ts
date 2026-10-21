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
  // A template's header image. Meta fetches this itself when the message
  // goes out and arrives with no cookie of ours — and what it serves is
  // already printed on every copy of that template. The POST on the same
  // path does its own permission check, so letting the prefix through
  // opens the picture, not the upload.
  "/api/t",
  "/api/campaigns/tick",
  "/api/dev/simulate",
  "/api/journeys/tick",
  "/api/journeys/digest",
  // The file a WhatsApp message points at. Public by necessity — the
  // women opening it are not logged in — and narrow by design: the route
  // serves one named slug's file and nothing a caller can name itself.
  "/f",
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

