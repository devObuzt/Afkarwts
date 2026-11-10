/**
 * إرسال رسالة واحدة لرقم واحد — لفحص القناة.
 *
 * منفصلة عن الإرسال الجماعي بالمقصود: الفحص بدّه رقم صريح بالأمر، مش
 * ملصق. `--go` إلزامي.
 */
import { sendSms } from "../app/lib/sms";

const phone = process.argv[2];
const text = process.argv[3] ?? "فحص قناة SMS من منظومة أفكار. ما بدها رد.";

if (!phone) {
  console.error("الاستعمال: npx tsx tools/sms-test.ts <رقم> [نص] --go");
  process.exit(1);
}

if (!process.argv.includes("--go")) {
  console.log(`\nمعاينة — رح تنبعت لـ${phone}:\n${"─".repeat(50)}\n${text}\n${"─".repeat(50)}\n(${[...text].length} حرف)\nللإرسال ضيف --go\n`);
} else {
  // بلا top-level await: tsx بيطلّع CJS هون وما بيدعمه.
  sendSms(phone, text)
    .then((result) => console.log("\n✅ الرد من إنفورو:", JSON.stringify(result), "\n"))
    .catch((error) => {
      console.error("\n🔴", error instanceof Error ? error.message : error, "\n");
      process.exit(1);
    });
}
