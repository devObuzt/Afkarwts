/** Towns for one country. See ../countries/route.ts for why this is proxied. */
import { NextRequest, NextResponse } from "next/server";

const ACCOUNTS =
  process.env.MANZUMA_ACCOUNTS_URL || process.env.NEXT_PUBLIC_MANZUMA_ACCOUNTS_URL || "https://accounts.manzuma.app";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country") || "";
  const lang = request.nextUrl.searchParams.get("lang") || "ar";
  /**
   * The search term, forwarded rather than dropped. The register replies with
   * at most 400 towns and Israel has 1,138 — searching only what came back
   * means two thirds of the country cannot be found.
   */
  const q = request.nextUrl.searchParams.get("q") || "";

  if (!country) {
    return NextResponse.json({ cities: [] });
  }

  try {
    const response = await fetch(
      `${ACCOUNTS}/api/locations/cities?country=${encodeURIComponent(country)}&lang=${encodeURIComponent(lang)}` +
        (q ? `&q=${encodeURIComponent(q)}` : ""),
      /**
       * Ten minutes, not a day. The register is small and rarely changes —
       * but when it does, it is because somebody could not find her town,
       * and a 24-hour cache means she still cannot. Fifty Arab localities
       * were corrected on 2026-10-15 and the form went on serving the old
       * list from cache long after the service had the new one.
       */
      { next: { revalidate: 600 } }
    );
    if (!response.ok) {
      throw new Error(`accounts responded ${response.status}`);
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("[locations] cities failed:", error);
    return NextResponse.json({ cities: [], error: "upstream" }, { status: 502 });
  }
}
