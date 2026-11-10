/**
 * نسخة بلاك فرايدي بهيدر صورة.
 *
 * قالب جديد مش تعديل على الشغّال: تعديل قالب معتمد لو انرفض بيخلّيه
 * REJECTED و**بيوقف يشتغل** — ووسام بنص الحملة. فالشغّال بيضل احتياط.
 *
 * ميتا ما بتقبل رابط صورة وقت الإنشاء: الملف بينرفع على **معرّف
 * التطبيق** (Resumable Upload) وبترجّع مقبض، والمقبض بينحط
 * كـ`example.header_handle`.
 */

import { createWhatsAppTemplate, uploadTemplateHeaderImage, type NewTemplate } from "../app/lib/whatsapp";
import { applyOptOutRule } from "../app/lib/templates/opt-out-rule";

const IMAGE = "https://pub-e69fa12de91c4e0f8f9b7083da137878.r2.dev/lp/afkar_bf/bf-wa-header.jpg";
const LANDING =
  "https://lp.connec.co.il/afkar_bf/?utm_source=whatsapp&utm_campaign=blackfriday20&utm_content=template";

const BODY = `بلاك فرايدي عند أفكار 🖤

هالسنة الخصم على المسارين الأساسيين: خصم 20% على إسبوع Clean ومسار Extra+ بكود BLACKFRIDAY20.

الدفعة الجاية {{1}} والعرض لحد {{2}} فقط.`;

async function main() {
  const go = process.argv.includes("--go");

  const response = await fetch(IMAGE);
  if (!response.ok) {
    throw new Error(`الصورة ما نزلت (${response.status})`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  console.log(`\nالصورة: ${bytes.byteLength.toLocaleString()} بايت · image/jpeg`);

  const base: NewTemplate & { optOutLine?: boolean } = {
    name: "afkar_blackfriday_2026_img",
    language: "ar",
    category: "MARKETING",
    bodyText: BODY,
    bodyExamples: ["15.11.2026", "30.11.2026"],
    buttons: [
      { type: "QUICK_REPLY", text: "معنية" },
      { type: "URL", text: "احجز مقعدك الآن", url: LANDING }
    ]
  };

  // نفس القاعدة الملزمة — بتضيف الفوتر وزر الإيقاف لحالها.
  const { template, blocked, notes } = applyOptOutRule(base);
  if (blocked) {
    throw new Error(notes.join(" "));
  }

  console.log(`\nالاسم: ${template.name} · ${template.category}`);
  console.log(`الفوتر: ${template.footerText}`);
  console.log("الأزرار:");
  for (const [index, button] of (template.buttons ?? []).entries()) {
    console.log(`  ${index}. ${button.type.padEnd(11)} «${button.type === "COPY_CODE" ? button.code : button.text}»`);
  }
  console.log(`الهيدر: صورة`);
  for (const note of notes) console.log(`  · ${note}`);

  if (!go) {
    console.log("\nمعاينة. للتنفيذ ضيف --go\n");
    return;
  }

  const handle = await uploadTemplateHeaderImage({ bytes, mimeType: "image/jpeg" });
  console.log(`\n✅ الصورة انرفعت · مقبض بطول ${handle.length}`);

  const result = await createWhatsAppTemplate({ ...template, headerImageHandle: handle });
  console.log("✅ انقدّم:", JSON.stringify(result));
  console.log(
    "\n⚠️ وقت الإرسال لازم تنعطى صورة الهيدر — ميتا بترد #132012 بلاها،" +
      " ورسالتها ما بتذكر صورة أبداً. ارفعها من شاشة القوالب على هاد القالب.\n"
  );
}

if (process.argv[1]?.includes("make-bf-image")) {
  main().catch((error) => {
    console.error("🔴", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
