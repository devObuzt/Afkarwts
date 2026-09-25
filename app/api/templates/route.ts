import { NextResponse } from "next/server";
import { listWhatsAppTemplates, type WhatsAppTemplate } from "@/app/lib/whatsapp";
import { listAliases } from "@/app/lib/template-aliases";
import { listFrozen, listGroups } from "@/app/lib/template-catalogue";

export const runtime = "nodejs";

let cache: { templates: WhatsAppTemplate[]; fetchedAt: number } | null = null;
let allCache: { templates: WhatsAppTemplate[]; fetchedAt: number } | null = null;
const CACHE_MS = 2 * 60 * 1000;

/**
 * Meta owns the template; everything else on it is ours and changes often, so
 * it is read fresh even when the Meta list is served from cache.
 */
function withLocal(templates: WhatsAppTemplate[]) {
  const aliases = listAliases();
  const frozen = new Set(listFrozen());
  const groups = listGroups();

  return templates.map((template) => ({
    ...template,
    alias: aliases[template.name] ?? "",
    frozen: frozen.has(template.name),
    groups: groups.filter((group) => group.templateNames.includes(template.name)).map((group) => group.name)
  }));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const force = params.get("refresh") === "1";
  // The management screen asks for everything, including what is still under
  // review or was rejected; every other caller only ever sends.
  const includeUnapproved = params.get("all") === "1";
  const slot = includeUnapproved ? allCache : cache;

  if (!force && slot && Date.now() - slot.fetchedAt < CACHE_MS) {
    return NextResponse.json({ templates: withLocal(slot.templates), groups: listGroups() });
  }

  try {
    const templates = await listWhatsAppTemplates({ includeUnapproved });
    const next = { templates, fetchedAt: Date.now() };
    if (includeUnapproved) {
      allCache = next;
    } else {
      cache = next;
    }
    return NextResponse.json({ templates: withLocal(templates), groups: listGroups() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load templates.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
