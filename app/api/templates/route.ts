import { NextResponse } from "next/server";
import { listWhatsAppTemplates, type WhatsAppTemplate } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

let cache: { templates: WhatsAppTemplate[]; fetchedAt: number } | null = null;
const CACHE_MS = 2 * 60 * 1000;

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";

  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ templates: cache.templates });
  }

  try {
    const templates = await listWhatsAppTemplates();
    cache = { templates, fetchedAt: Date.now() };
    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load templates.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
