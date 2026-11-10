import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { createWhatsAppTemplate, type NewTemplate } from "@/app/lib/whatsapp";
import { applyOptOutRule } from "@/app/lib/templates/opt-out-rule";
import { setOptOutLine } from "@/app/lib/template-catalogue";
import { recordAction } from "@/app/lib/users/audit";
import { sendTelegramMessage } from "@/app/lib/telegram";

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

  // 🔴 الفئة بتيجي من الحمولة، وTypeScript ما بيفحصها وقت التشغيل:
  // `"marketing"` صغيرة أو فيها فراغ كانت بتمرق وبتتخطّى القاعدة. فصارت
  // تنفحص كقيمة محصورة.
  const category = String(body.category ?? "").trim().toUpperCase();
  if (category !== "UTILITY" && category !== "MARKETING") {
    return NextResponse.json({ error: "الفئة لازم تكون UTILITY أو MARKETING." }, { status: 400 });
  }

  // 🔴 وميتا بتقدر **تعيد تصنيف** قالب لـMARKETING لما يكون
  // `allowCategoryChange` مفتوح — فقالب UTILITY بلا طريق خروج بيصير
  // تسويقي بلا طريق خروج. مقفول افتراضياً، وبينفتح بقرار صريح بس.
  const allowCategoryChange = body.allowCategoryChange === true;

  const normalized = { ...body, category: category as "UTILITY" | "MARKETING", allowCategoryChange };

  // القاعدة بتنطبق هون، قبل ما يروح لميتا — عشان ما يقدر مسار تاني
  // يتخطّاها.
  const { template, applied, blocked, notes } = applyOptOutRule(normalized);

  // الفشل مقفول: القاعدة ما قدرت تنطبق ← ما منعمل القالب أصلاً.
  if (blocked) {
    return NextResponse.json({ error: notes.join(" "), optOut: { applied: false, notes } }, { status: 400 });
  }

  try {
    const result = await createWhatsAppTemplate(template);

    // 🔑 بينكتب **الواقع** مش النيّة: `applied` هو اللي انطبّق فعلاً.
    // لو كتبنا `optOutLine !== false` كان السجل بيقول «يحمل سطر إيقاف»
    // على قالب ما بيحمله — وحارس الإرسال بيقرا من نفس السجل.
    const metaCategory = String((result as { category?: string }).category ?? template.category).toUpperCase();

    if (metaCategory === "MARKETING") {
      setOptOutLine(template.name, applied);

      // ميتا صنّفته تسويقي بينما إحنا عملناه UTILITY ← القاعدة ما
      // انطبّقت عليه. ما بنقدر نضيف الزر بلا تعديل (24 ساعة)، بس على
      // الأقل بينصرخ بدل ما يمرق بصمت.
      if (template.category !== "MARKETING") {
        recordAction({
          userId: auth.user.id,
          actor: auth.user.name,
          action: "template.optoutline",
          subjectType: "template",
          subjectId: template.name,
          subjectLabel: template.name,
          detail: "🔴 ميتا صنّفته MARKETING بينما انعمل UTILITY — بلا طريق خروج. بدّه تعديل."
        });
        void sendTelegramMessage(
          `🔴 أفكار · قالب «${template.name}» انعمل UTILITY وميتا صنّفته MARKETING — بلا طريق إيقاف. بدّه تعديل.`
        ).catch(() => undefined);
      }

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
