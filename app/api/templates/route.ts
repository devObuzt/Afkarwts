import { NextResponse } from "next/server";
import { listWhatsAppTemplates, type WhatsAppTemplate } from "@/app/lib/whatsapp";
import { listAliases } from "@/app/lib/template-aliases";

export const runtime = "nodejs";

let cache: { templates: WhatsAppTemplate[]; fetchedAt: number } | null = null;
const CACHE_MS = 2 * 60 * 1000;

function withAliases(templates: WhatsAppTemplate[]) {
  const aliases = listAliases();
  return templates.map((template) => ({ ...template, alias: aliases[template.name] ?? "" }));
}

export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("refresh") === "1";

  // Aliases are ours and change often, so they are read fresh even when the
  // Meta list is served from cache.
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ templates: withAliases(cache.templates) });
  }

  try {
    const templates = await listWhatsAppTemplates();
    cache = { templates, fetchedAt: Date.now() };
    return NextResponse.json({ templates: withAliases(templates) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load templates.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
