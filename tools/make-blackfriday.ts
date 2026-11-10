/**
 * قالب بلاك فرايدي 2026 عند أفكار.
 *
 * النص من وسام حرفياً، بتصحيح واحد: ترقيم المتغيّرات. كتبها `{{2}}`
 * و`{{3}}` بلا `{{1}}`، وميتا بتطلب الترقيم يبلّش من 1 — فالقالب كان
 * بينرفض. صارت `{{1}}` (الدفعة الجاية) و`{{2}}` (العرض لحد).
 *
 * والأزرار بترتيب وسام: نسخ الكود ← احجز مقعدك ← إيقاف الرسائل.
 * التلاتة كلهن non-quick-reply فما في قيد تجميع، وتلاتة هو السقف اللي
 * بيضل ظاهر (الرابع بيخفّي الباقي ورا «See all options»).
 *
 * الاستعمال: npx tsx tools/make-blackfriday.ts [--go]
 */

import { createWhatsAppTemplate, type NewTemplate } from "../app/lib/whatsapp";

const NAME = "afkar_blackfriday_2026";

const BODY = `بلاك فرايدي عند أفكار 🖤

هالسنة الخصم على المسارين الأساسيين: خصم 20% على إسبوع Clean ومسار Extra+ بكود BLACKFRIDAY20.

الدفعة الجاية {{1}} والعرض لحد {{2}}.`;

/** صفحة الهبوط — متحقَّق منها حيّة (301 ← /afkar_bf/ ← 200). */
const LANDING =
  "https://lp.connec.co.il/afkar_bf/?utm_source=whatsapp&utm_campaign=blackfriday20&utm_content=template";

const OPT_OUT_URL = "https://www.afkarheartbeat.com/stop/{{1}}";

export const TEMPLATE: NewTemplate = {
  name: NAME,
  language: "ar",
  category: "MARKETING",
  bodyText: BODY,
  bodyExamples: ["15.12.2026", "30.11.2026"],
  // قاعدة وسام 10.11: كل قالب MARKETING بياخد سطر الإيقاف افتراضياً.
  footerText: "ما بتحب تستلم عروض؟ اكبس «إيقاف الرسائل»",
  buttons: [
    { type: "COPY_CODE", code: "BLACKFRIDAY20" },
    { type: "URL", text: "احجز مقعدك الآن", url: LANDING },
    {
      type: "URL",
      text: "إيقاف الرسائل",
      url: OPT_OUT_URL,
      urlExample: "https://www.afkarheartbeat.com/stop/OTcyNTAwMDAwMDAw.AbCdEfGhIjKlMnOp"
    }
  ]
};

function describe() {
  console.log(`\nالاسم:    ${TEMPLATE.name}  ·  ${TEMPLATE.language}  ·  ${TEMPLATE.category}`);
  console.log(`\nالنص:\n${"─".repeat(60)}\n${TEMPLATE.bodyText}\n${"─".repeat(60)}`);
  console.log(`\nالفوتر:   ${TEMPLATE.footerText}  (${[...(TEMPLATE.footerText ?? "")].length} من 60)`);
  console.log(`\nالأمثلة:  {{1}} = ${TEMPLATE.bodyExamples?.[0]}   ·   {{2}} = ${TEMPLATE.bodyExamples?.[1]}`);
  console.log("\nالأزرار:");
  for (const [index, button] of (TEMPLATE.buttons ?? []).entries()) {
    const label = button.type === "COPY_CODE" ? `نسخ الكود: ${button.code}` : `«${button.text}»`;
    const extra = button.type === "URL" ? `\n            ${button.url}` : "";
    console.log(`  ${index}. ${button.type.padEnd(11)} ${label}${extra}`);
  }
  const codeChars = [...("BLACKFRIDAY20")].length;
  console.log(`\nطول الكود: ${codeChars} من 20 ✓`);
}

async function main() {
  describe();

  if (!process.argv.includes("--go")) {
    console.log("\nمعاينة. للتقديم على ميتا ضيف --go\n");
    return;
  }

  const result = await createWhatsAppTemplate(TEMPLATE);
  console.log("\n✅ انقدّم:", JSON.stringify(result));
  console.log("المراجعة لحد 24 ساعة. ⚠️ أول إرسالة لازم تروح لرقم وسام — شكل بارامتر زر نسخ الكود مش موثّق عند ميتا.\n");
}

if (process.argv[1]?.includes("make-blackfriday")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
