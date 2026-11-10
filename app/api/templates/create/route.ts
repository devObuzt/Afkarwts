import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { createWhatsAppTemplate, type NewTemplate } from "@/app/lib/whatsapp";
import { applyOptOutRule } from "@/app/lib/templates/opt-out-rule";
import { setOptOutLine } from "@/app/lib/template-catalogue";
import { recordAction } from "@/app/lib/users/audit";

export const runtime = "nodejs";

/** Meta's own rule: lower case, digits and underscores, nothing else. */
function isValidName(name: string) {
  return /^[a-z0-9_]{1,512}$/.test(name);
}

export async function POST(request: Request) {
  const auth = await requireApi("templates.manage");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json()) as NewTemplate & { optOutLine?: boolean };

  if (!isValidName(body.name ?? "")) {
    return NextResponse.json(
      { error: "The name may only hold lower-case letters, digits and underscores — no spaces, no Arabic." },
      { status: 400 }
    );
  }

  if (!body.bodyText?.trim()) {
    return NextResponse.json({ error: "A template needs body text." }, { status: 400 });
  }

  // القاعدة بتنطبق هون، قبل ما يروح لميتا — عشان ما يقدر مسار تاني
  // يتخطّاها.
  const { template, applied, notes } = applyOptOutRule(body);

  try {
    const result = await createWhatsAppTemplate(template);

    // القرار بينكتب حتى لو القاعدة ما انطبقت، عشان نعرف ليش.
    if (template.category === "MARKETING") {
      setOptOutLine(template.name, body.optOutLine !== false);
      if (body.optOutLine === false) {
        recordAction({
          userId: auth.user.id,
          actor: auth.user.name,
          action: "template.optoutline",
          subjectType: "template",
          subjectId: template.name,
          subjectLabel: template.name,
          detail: "قالب تسويقي انعمل بلا سطر إيقاف الرسائل — بقرار صريح"
        });
      }
    }

    return NextResponse.json({ template: result, optOut: { applied, notes } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Meta refused the template." },
      { status: 502 }
    );
  }
}
