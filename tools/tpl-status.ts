/** حالة قالب أو أكثر عند ميتا، بالحرف. */
const V = process.env.WHATSAPP_API_VERSION || "v23.0";
const names = process.argv.slice(2).filter((item) => !item.startsWith("--"));

fetch(
  `https://graph.facebook.com/${V}/${process.env.WHATSAPP_WABA_ID}/message_templates` +
    `?fields=name,status,category,quality_score,rejected_reason,components&limit=200`,
  { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } }
)
  .then((response) => response.json())
  .then((payload: { data?: Array<Record<string, unknown>>; error?: { message?: string } }) => {
    if (payload.error) throw new Error(payload.error.message);
    for (const name of names) {
      const t = payload.data?.find((item) => item.name === name);
      if (!t) {
        console.log(`🔴 ${name} — مش موجود`);
        continue;
      }
      const components = (t.components as Array<{ type: string; format?: string }>) ?? [];
      const header = components.find((c) => c.type === "HEADER");
      const ok = t.status === "APPROVED";
      console.log(
        `${ok ? "✅" : "⏳"} ${name}\n` +
          `   الحالة: ${t.status}${t.rejected_reason ? ` · سبب الرفض: ${t.rejected_reason}` : ""}\n` +
          `   هيدر: ${header ? header.format : "بلا"}   ·   جودة: ${JSON.stringify(t.quality_score ?? null)}\n` +
          `   ${ok ? "بينبعت" : "🔴 ميتا ما بتبعت قالب غير APPROVED — أي إرسالة بترجع خطأ"}`
      );
    }
  })
  .catch((error) => {
    console.error("🔴", error instanceof Error ? error.message : error);
    process.exit(1);
  });
