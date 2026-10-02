/**
 * The town register lives at Manzuma, one list for every product. A browser
 * on this domain cannot read it across origins — that refusal is what left
 * the same picker showing an empty list in production at LegaliSync for three
 * days. So the page asks us, and we ask them.
 */
import { NextRequest, NextResponse } from "next/server";

const ACCOUNTS =
  process.env.MANZUMA_ACCOUNTS_URL || process.env.NEXT_PUBLIC_MANZUMA_ACCOUNTS_URL || "https://accounts.manzuma.app";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get("lang") || "ar";

  try {
    const response = await fetch(`${ACCOUNTS}/api/locations/countries?lang=${encodeURIComponent(lang)}`, {
      next: { revalidate: 86400 }
    });
    if (!response.ok) {
      throw new Error(`accounts responded ${response.status}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("[locations] countries failed:", error);
    return NextResponse.json({ countries: [], error: "upstream" }, { status: 502 });
  }
}
