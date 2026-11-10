import type { NewTemplate, NewTemplateButton } from "../whatsapp";

/**
 * قاعدة وسام (10.11.2026): **كل قالب MARKETING بياخد سطر إيقاف الرسائل.**
 *
 * 🔑 **محطوطة على السيرفر مش بالفورم.** قاعدة محروسة بالواجهة بس هي
 * قاعدة أي مسار تاني بيتخطّاها — سكربت، أداة، أو استدعاء مباشر للـAPI.
 * الفورم بيعرض الخيار معلَّم عشان وسام يشوفه ويقدر يشيله؛ والسيرفر هو
 * اللي بيفرضه فعلاً.
 *
 * الإلغاء قرار: بينبعت `optOutLine: false` صراحةً وبينكتب باللوج
 * وبـ`template_aliases.opt_out_line` — فبنعرف الفرق بين «قرّرنا لأ»
 * وبين «ما حدا فتحه لهلق».
 */

export const OPT_OUT_FOOTER = "ما بتحب تستلم عروض؟ اكبس «إيقاف الرسائل»";
export const OPT_OUT_BUTTON_TEXT = "إيقاف الرسائل";

function base() {
  return (process.env.PUBLIC_BASE_URL || "https://www.afkarheartbeat.com").replace(/\/+$/, "");
}

/** النوع صريح (مش الاتحاد) عشان `.url` تكون مقروءة بلا تضييق. */
export function optOutButton(): { type: "URL"; text: string; url: string; urlExample: string } {
  return {
    type: "URL",
    text: OPT_OUT_BUTTON_TEXT,
    url: `${base()}/stop/{{1}}`,
    urlExample: `${base()}/stop/OTcyNTAwMDAwMDAw.AbCdEfGhIjKlMnOp`
  };
}

/**
 * هل الزر الموجود هو **زرّنا** فعلاً.
 *
 * 🔴 كان `url.includes("/stop/")` — وهاد بيخلّي أي رابط فيه المقطع
 * (`https://any.site/stop/x`) يمرّق كأنه طريق خروج، فالقاعدة بتتخطّى
 * نفسها والمنظومة بتسجّل «يحمل سطر إيقاف» على قالب ما بيحمله. وأسوأ
 * إشي إنّ حارس الإرسال بيقرا من نفس السجل.
 *
 * فالمقارنة صارت على **الأصل والمسار**: نفس الهوست ومسار `/stop/`
 * بالضبط. أي إشي تاني = مش زرّنا، والزر الحقيقي بينضاف.
 */
export function alreadyCarriesOptOut(buttons: NewTemplateButton[] | undefined) {
  const expected = new URL(optOutButton().url.replace("{{1}}", "x"));
  return (buttons ?? []).some((button) => {
    if (button.type !== "URL") {
      return false;
    }
    try {
      const url = new URL(button.url.replace("{{1}}", "x"));
      return url.origin === expected.origin && url.pathname.startsWith("/stop/");
    } catch {
      return false;
    }
  });
}

/**
 * بترجّع القالب وقد انطبّقت عليه القاعدة، مع سبب مقروء لكل تغيير.
 *
 * ما بتلمس الفوتر الموجود: فوتر البراند كلام معتمد، والزر لحاله هو
 * طريق الخروج — السطر إشارة عليه.
 */
export function applyOptOutRule(
  input: NewTemplate & { optOutLine?: boolean }
): { template: NewTemplate; applied: boolean; blocked?: boolean; notes: string[] } {
  const wanted = input.optOutLine !== false;
  const notes: string[] = [];

  if (input.category !== "MARKETING") {
    return { template: input, applied: false, notes: ["القالب مش MARKETING — القاعدة ما بتنطبق."] };
  }
  if (!wanted) {
    return { template: input, applied: false, notes: ["انلغى بقرار صريح."] };
  }
  if (alreadyCarriesOptOut(input.buttons)) {
    return { template: input, applied: true, notes: ["فيه زر الهسرة أصلاً."] };
  }

  const buttons = [...(input.buttons ?? [])];

  // 🔑 ثلاثة هو السقف اللي بيضل ظاهر عند ميتا — الرابع وما بعده بينخفوا
  // ورا «See all options»، وساعتها طريق الخروج القانوني بيصير مخبّى.
  if (buttons.length >= 3) {
    // 🔑 الفشل مقفول: بترجّع `blocked` فالمسار بيرفض بـ400 بدل ما يعمل
    // القالب بهدوء ويسجّله كملتزم. إنشاء قالب تسويقي بلا طريق خروج
    // وتسجيله كأنه ملتزم أسوأ من رفض بوجه صاحبه.
    return {
      template: input,
      applied: false,
      blocked: true,
      notes: [`فيه ${buttons.length} أزرار — زر الهسرة بينخفي ورا «See all options». شيلي زر.`]
    };
  }

  // الردود السريعة لازم تضل مجمّعة والروابط بمجموعتها — ميتا بترفض
  // «رد، رابط، رد». فالهسرة بتنحط آخر واحد دايماً.
  buttons.push(optOutButton());
  notes.push(`انضاف زر «${OPT_OUT_BUTTON_TEXT}» آخر الأزرار.`);

  let footerText = input.footerText;
  if (!footerText?.trim()) {
    footerText = OPT_OUT_FOOTER;
    notes.push("انضاف سطر الفوتر.");
  } else {
    notes.push(`الفوتر الحالي «${footerText.trim()}» ضلّ زي ما هو — الزر لحاله هو طريق الخروج.`);
  }

  return { template: { ...input, footerText, buttons }, applied: true, notes };
}
