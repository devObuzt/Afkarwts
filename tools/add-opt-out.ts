/**
 * بتضيف طريق الخروج القانوني لكل قالب تسويق عند أفكار: سطر بالفوتر، وزر
 * رابط فيه توكن الرقم.
 *
 * 🔴 ثلاث حقائق بتحكم هاي الأداة:
 *
 * 1. **التعديل عند ميتا بيستبدل كل المكوّنات.** مش بينعدّل مكوّن لحاله —
 *    اللي ما بتبعته بينمحي. فالأداة بتقرا القالب كامل (مع `example`
 *    تبع الجسم والهيدر) وبترجّعه حرفياً ومعه الإضافة. أي تبسيط هون
 *    بيمحي جسم قالب معتمد.
 *
 * 2. **القالب اللي تعديله بينرفض بيوقف يشتغل.** ميتا بتقول: الحالة غير
 *    APPROVED = ما بينبعت. يعني تعديل غلط على ٥٨ قالب بيوقف كل مسار
 *    الكلين دفعة وحدة. لهيك الأداة بتمشي **قالب قالب**، بتوقف عند أول
 *    رفض، وبتسجّل كل خطوة بـ`tools/opt-out-edits.jsonl`.
 *
 * 3. **الزر المتغيّر بدّه قيمة وقت الإرسال.** `sendWhatsAppTemplate`
 *    بتحطّها لحالها لما تشوف الزر بالقالب — فالقالب المعدّل بيضل يشتغل
 *    من أول لحظة بلا ما يتغيّر ولا محل إرسال.
 *
 * الاستعمال (بلا `--go` = معاينة، زي كل أدوات البيت):
 *   npx tsx tools/add-opt-out.ts                     # شو رح يصير
 *   npx tsx tools/add-opt-out.ts --campaigns              # الدفعة الأولى
 *   npx tsx tools/add-opt-out.ts --campaigns --go
 *   npx tsx tools/add-opt-out.ts --only club_offer_sep2026 --go
 *   npx tsx tools/add-opt-out.ts --go --limit 5
 */

/**
 * القوالب اللي فعلياً انبعتوا كحملات (قياس من جدول الحملات 02.11.2026).
 * هاي الدفعة الأولى: بتغطّي كل التسويق الحقيقي بأصغر سطح خطر.
 */
export const CAMPAIGN_TEMPLATES = [
  "club_offer_sep2026",
  "club_discount_3days",
  "extra_plus_clean_sale_48h",
  "clean_reminder_extra_plus_img",
  "clean_start_announcement_v2",
  "shaper"
];

const API = process.env.WHATSAPP_API_VERSION || "v23.0";
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WABA = process.env.WHATSAPP_WABA_ID;
const BASE = process.env.PUBLIC_BASE_URL || "https://www.afkarheartbeat.com";

/** النص القانوني. ≤60 حرف — ميتا بترفض فوتر أطول. */
export const FOOTER_TEXT = "ما بتحب تستلم عروض؟ اكبس «إيقاف الرسائل»";

/** نص زر الهسرة. ≤25 حرف. */
export const BUTTON_TEXT = "إيقاف الرسائل";

/**
 * زرّي الجواب على العرض (قرار وسام 02.11).
 *
 * 🔑 **ثلاثة أزرار هو السقف اللي بيضل ظاهر.** ميتا بتعرض الرابع وما
 * بعده ورا «See all options» — وساعتها زر الهسرة بينخفي، يعني طريق
 * الخروج القانوني بيصير مخبّى ورا كبسة. فما منزيد عن تلاتة.
 *
 * والترتيب مفروض من ميتا: الردود السريعة لازم تكون **مجمّعة** والرابط
 * بمجموعته — «رد، رابط، رد» مرفوض. فالهسرة آخر واحد، زي ما بدّه وسام.
 */
export const YES_TEXT = "نعم بدي العرض";
export const NO_TEXT = "شكراً لا أريد";

export const BUTTON_URL = `${BASE.replace(/\/+$/, "")}/stop/{{1}}`;

type Component = Record<string, unknown> & { type?: string; buttons?: Array<Record<string, unknown>> };
type Template = { id: string; name: string; language: string; category: string; status: string; components: Component[] };

function flag(name: string) {
  return process.argv.includes(name);
}

function value(name: string) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function listAll(): Promise<Template[]> {
  if (!TOKEN || !WABA) {
    throw new Error("WHATSAPP_ACCESS_TOKEN و WHATSAPP_WABA_ID لازمين.");
  }
  let url: string | null =
    `https://graph.facebook.com/${API}/${WABA}/message_templates` +
    `?fields=id,name,status,language,category,components&limit=200`;
  const all: Template[] = [];
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const payload = (await response.json()) as { data?: Template[]; paging?: { next?: string }; error?: { message?: string } };
    if (!response.ok) {
      throw new Error(payload.error?.message || `قراءة القوالب فشلت (${response.status})`);
    }
    all.push(...(payload.data ?? []));
    url = payload.paging?.next ?? null;
  }
  return all;
}

/** هل القالب فيه زر الهسرة أصلاً. */
export function hasOptOut(components: Component[]) {
  const buttons = components.find((component) => component.type === "BUTTONS")?.buttons ?? [];
  return buttons.some(
    (button) => button.type === "URL" && String(button.url ?? "").includes("/stop/")
  );
}

/**
 * بتبني المكوّنات الجديدة من القديمة.
 *
 * 🔑 **الزر هو طريق الخروج، والفوتر إشارة عليه.** لهيك القالب اللي عندو
 * فوتر غير إلنا (زي «Afkar – Eat.Love.Fit» على قالبي العروض) **ما
 * بينتخطّى**: فوتره بيضل زي ما هو وبينضافلو الزر. ميتا بتسمح بفوتر
 * واحد بس، والخيار بين «نمحي كلام البراند» و«نترك القالب بلا طريق خروج»
 * — الزر بيحلّ الاثنين.
 *
 * بترجّع `skip` بسبب مكتوب (مش استثناء) عشان السبب يطلع بالتقرير.
 */
export function planComponents(components: Component[]): { next: Component[]; keptFooter: boolean } | { skip: string } {
  if (hasOptOut(components)) {
    return { skip: "فيه زر الهسرة أصلاً" };
  }

  const footer = components.find((component) => component.type === "FOOTER");
  const keptFooter = Boolean(footer && String(footer.text ?? "").trim() !== FOOTER_TEXT);

  const buttonsComponent = components.find((component) => component.type === "BUTTONS");
  const existing = buttonsComponent?.buttons ?? [];
  // ثلاثة هو السقف الظاهر، والهسرة لازم تضل وحدة منهن.
  if (existing.length >= 3) {
    return { skip: `فيه ${existing.length} أزرار — الهسرة بتنخفي ورا «See all options»` };
  }

  // الردود السريعة الموجودة بتضل زي ما هي — «بدي العرض» و«معني»
  // معتمدين عند ميتا وبيشتغلوا، وتبديلهم بيكسر سجل الحملات القديمة.
  const existingQuickReplies = existing.filter((button) => button.type === "QUICK_REPLY");
  const hasYes = existingQuickReplies.length > 0;
  const added: Array<Record<string, unknown>> = [];
  if (!hasYes) {
    added.push({ type: "QUICK_REPLY", text: YES_TEXT });
  }
  if (existingQuickReplies.length < 2) {
    added.push({ type: "QUICK_REPLY", text: NO_TEXT });
  }

  const optOutButton = {
    type: "URL",
    text: BUTTON_TEXT,
    url: BUTTON_URL,
    // ميتا بتطلب مثال لكل متغيّر. التوكن الحقيقي بينحسب وقت الإرسال.
    example: [`${BASE.replace(/\/+$/, "")}/stop/OTcyNTAwMDAwMDAw.AbCdEfGhIjKlMnOp`]
  };

  // 🔑 الترتيب مقصود: ميتا بتحط الفوتر قبل الأزرار، والأزرار آخر إشي.
  // وكل مكوّن غير الفوتر والأزرار بينتسخ **زي ما هو** — بما فيه
  // `example` تبع الجسم، اللي بلاه التعديل بينرفض.
  const next: Component[] = components
    .filter((component) => component.type !== "FOOTER" && component.type !== "BUTTONS")
    .map((component) => ({ ...component }));

  next.push(keptFooter ? { ...(footer as Component) } : { type: "FOOTER", text: FOOTER_TEXT });
  // الترتيب: كل الردود السريعة أولاً (الموجودة ثم المضافة)، وبعدها
  // الرابط. خلطهن بيرفضه ميتا.
  const quickReplies = [...existingQuickReplies.map((button) => ({ ...button })), ...added];
  const others = existing.filter((button) => button.type !== "QUICK_REPLY").map((button) => ({ ...button }));
  next.push({ type: "BUTTONS", buttons: [...quickReplies, ...others, optOutButton] });

  return { next, keptFooter };
}

async function edit(template: Template, components: Component[]) {
  const response = await fetch(`https://graph.facebook.com/${API}/${template.id}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ components })
  });
  const payload = (await response.json()) as { success?: boolean; error?: { message?: string; error_user_msg?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.error_user_msg || payload.error?.message || `التعديل فشل (${response.status})`);
  }
  return payload;
}

async function main() {
  const go = flag("--go");
  // لائحة بفواصل: التعديل بينزل على دفعات مسمّاة مش على كل إشي مرة
  // وحدة. (القياس 02.11: ٦ قوالب بس انبعتوا كحملات فعلياً من أصل ٥٨
  // «تسويقي» عند ميتا — الباقي محتوى مسار ميتا مصنّفته غلط.)
  const only = (flag("--campaigns") ? CAMPAIGN_TEMPLATES.join(",") : value("--only"))
    ?.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const limit = Number(value("--limit") || 0);

  const all = await listAll();
  let marketing = all.filter((template) => template.category === "MARKETING");
  if (only?.length) {
    marketing = marketing.filter((template) => only.includes(template.name));
    const missing = only.filter((name) => !marketing.some((template) => template.name === name));
    if (missing.length) {
      console.error(`🔴 أسماء مش موجودة أو مش تسويقية: ${missing.join(" · ")}`);
      process.exit(1);
    }
  }

  console.log(`\nالفوتر:  ${FOOTER_TEXT}   (${[...FOOTER_TEXT].length} حرف من 60)`);
  console.log(`الزر:    ${BUTTON_TEXT}   (${[...BUTTON_TEXT].length} حرف من 25)`);
  console.log(`الرابط:  ${BUTTON_URL}\n`);
  console.log(`قوالب التسويق: ${marketing.length} من ${all.length}\n`);

  const { appendFileSync } = await import("node:fs");
  let done = 0;
  let skipped = 0;

  for (const template of marketing) {
    if (limit && done >= limit) {
      console.log(`\n⏸  وقفت عند ${limit} بطلبك. الباقي: ${marketing.length - done - skipped}`);
      break;
    }

    const plan = planComponents(template.components ?? []);
    if ("skip" in plan) {
      skipped += 1;
      console.log(`⏭  ${template.name} — ${plan.skip}`);
      continue;
    }

    if (!go) {
      console.log(
        `·  ${template.name} (${template.status}) — ` +
          (plan.keptFooter ? "الزر فقط، وفوتره الحالي بيضل" : "الفوتر + الزر")
      );
      done += 1;
      continue;
    }

    try {
      await edit(template, plan.next);
      done += 1;
      console.log(`✅ ${template.name} — انبعت للمراجعة`);
      appendFileSync(
        "tools/opt-out-edits.jsonl",
        JSON.stringify({ at: new Date().toISOString(), name: template.name, id: template.id, ok: true }) + "\n"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendFileSync(
        "tools/opt-out-edits.jsonl",
        JSON.stringify({ at: new Date().toISOString(), name: template.name, id: template.id, ok: false, error: message }) + "\n"
      );
      // 🔴 بتوقف عند أول فشل بالمقصود: نفس الغلط رح يتكرر على الـ57
      // الباقيين، والقالب اللي تعديله بينرفض بيوقف يشتغل.
      console.error(`\n🔴 ${template.name} — ${message}`);
      console.error("وقفت هون. صلّح السبب وشغّل من جديد — اللي انعدّل ما بينعاد.");
      process.exit(1);
    }
  }

  console.log(`\n${go ? "انعدّل" : "رح ينعدّل"}: ${done} · انتُخطّى: ${skipped}`);
  if (!go) {
    console.log("معاينة. للتنفيذ ضيف --go\n");
  } else {
    console.log("المراجعة عند ميتا لحد 24 ساعة. افحص الحالة بـ/new/templates\n");
  }
}

if (process.argv[1]?.includes("add-opt-out")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
