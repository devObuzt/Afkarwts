import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getMessagingLimit } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  const limit = await getMessagingLimit();
  return NextResponse.json({ limit });
}
