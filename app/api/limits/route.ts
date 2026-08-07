import { NextResponse } from "next/server";
import { getMessagingLimit } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  const limit = await getMessagingLimit();
  return NextResponse.json({ limit });
}
