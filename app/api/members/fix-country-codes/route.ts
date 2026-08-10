import { NextResponse } from "next/server";
import { fixPalestinianCountryCodes } from "@/app/lib/db";

export const runtime = "nodejs";

// One-off maintenance: rewrites +97256/+97259 numbers (Palestinian carriers
// imported with the wrong country code) to +970. Idempotent.
export async function POST() {
  return NextResponse.json(fixPalestinianCountryCodes());
}
