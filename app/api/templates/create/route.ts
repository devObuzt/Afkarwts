import { NextResponse } from "next/server";
import { createWhatsAppTemplate, type NewTemplate } from "@/app/lib/whatsapp";

export const runtime = "nodejs";

/** Meta's own rule: lower case, digits and underscores, nothing else. */
function isValidName(name: string) {
  return /^[a-z0-9_]{1,512}$/.test(name);
}

export async function POST(request: Request) {
  const body = (await request.json()) as NewTemplate;

  if (!isValidName(body.name ?? "")) {
    return NextResponse.json(
      { error: "The name may only hold lower-case letters, digits and underscores — no spaces, no Arabic." },
      { status: 400 }
    );
  }

  if (!body.bodyText?.trim()) {
    return NextResponse.json({ error: "A template needs body text." }, { status: 400 });
  }

  try {
    const result = await createWhatsAppTemplate(body);
    return NextResponse.json({ template: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta refused the template." },
      { status: 502 }
    );
  }
}
