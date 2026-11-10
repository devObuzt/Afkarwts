/** فحص قناة الـSMS: هل هي حيّة فعلاً، وكيف بينتحوّل كل شكل رقم. */
import { toLocalIsraeli } from "../app/lib/sms-format";
import { isLive } from "../app/lib/outbound-guard";

console.log("RAILWAY_PROJECT_NAME:", JSON.stringify(process.env.RAILWAY_PROJECT_NAME));
console.log("SMS_PROVIDER        :", JSON.stringify(process.env.SMS_PROVIDER));
console.log("DRY_RUN             :", JSON.stringify(process.env.DRY_RUN));
console.log("SMS_SENDER          :", JSON.stringify(process.env.SMS_SENDER));
console.log("INFORU_AUTH         :", process.env.INFORU_AUTH ? "موجود" : "ناقص");
console.log("isLive()            :", isLive(), isLive() ? "← بيبعت فعلاً" : "🔴 ← كل إرسالة بترجع dry-run");
for (const phone of ["+972526993229", "+970593228820", "0526993229", "+972538868271"]) {
  let out: string;
  try {
    out = toLocalIsraeli(phone);
  } catch (error) {
    out = `🔴 ${error instanceof Error ? error.message : error}`;
  }
  console.log(`  ${phone.padEnd(15)} → ${out}`);
}
