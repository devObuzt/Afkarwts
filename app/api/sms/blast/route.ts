import { NextResponse } from "next/server";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "@/app/lib/media-store";
import { audienceFor, renderFor, segments, STOP_TOKEN } from "@/app/lib/sms/blast";
import { sendSms } from "@/app/lib/sms";
import { requireApi } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { recordAction } from "@/app/lib/users/audit";
import { sendTelegramMessage } from "@/app/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * معاينة أو إرسال SMS لملصقات.
 *
 * 🔑 **المعاينة هي الافتراضي.** `go: true` لازم تجي صراحةً — نفس منطق
 * كل أدوات البيت. والتأكيد مكتوب: لازم يبعت العدد اللي شافه، وإذا تغيّر
 * العدد بين المعاينة والإرسال بينرفض — عشان ما ينبعت لجمهور غير اللي
 * انعرض عليه.
 */
export async function POST(request: Request) {
  // 🔒 `people.edit` كانت غلط: بتخوّل المرافِقة تعدّل بيانات منتسبة —
  // مش تبعت خمس آلاف رسالة. الإرسال الجماعي بدّه **الاثنين**:
  // `messages.send` (إنّه مخوّل يبعت) و`people.all` (إنّه مخوّل يشوف كل
  // الجمهور أصلاً) — والمرافِقة عندها الأولى بلا التانية، فبتنحجب.
  const auth = await requireApi("messages.send");
  if (!auth.ok) {
    return auth.response;
  }
  if (!can(auth.user, "people.all")) {
    return NextResponse.json(
      { error: "الإرسال الجماعي لمين بيشوف كل أعضاء النادي — إنتِ بتشوفي منتسباتك بس." },
      { status: 403 }
    );
  }

  const body = (await request.json()) as {
    labelIds?: number[];
    text?: string;
    go?: boolean;
    expected?: number;
    limit?: number;
  };

  const labelIds = (body.labelIds ?? []).map(Number).filter(Number.isInteger);
  const text = (body.text ?? "").trim();

  if (!labelIds.length) {
    return NextResponse.json({ error: "اختاري ملصق واحد على الأقل." }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "النص فاضي." }, { status: 400 });
  }
  if (!text.includes(STOP_TOKEN)) {
    // القانون بيطلب طريق خروج بكل رسالة تسويق، والرابط هو الآلية الوحيدة
    // اللي بتشتغل: اسم المرسل أبجدي وما بينرد عليه.
    return NextResponse.json(
      { error: `النص لازم يحمل ${STOP_TOKEN} — هو مكان رابط إيقاف الرسائل.` },
      { status: 400 }
    );
  }

  let audience;
  try {
    audience = audienceFor(labelIds);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "ملصق غير صالح." }, { status: 400 });
  }

  const sample = renderFor(text, audience.recipients[0]?.id ?? 1);
  const perMessage = segments(sample);

  if (!body.go) {
    return NextResponse.json({
      preview: {
        sample,
        chars: [...sample].length,
        segments: perMessage,
        recipients: audience.recipients.length,
        stopped: audience.stopped.length,
        messages: audience.recipients.length * perMessage
      }
    });
  }

  // الجمهور تغيّر بين المعاينة والإرسال ← وقف. منتسبة انضافت لملصق
  // بالدقيقة اللي بينهن بتخلّي الإرسال يطلع لناس ما انعرضوا.
  if (body.expected !== undefined && body.expected !== audience.recipients.length) {
    return NextResponse.json(
      { error: `العدد تغيّر: شفتي ${body.expected} وصار ${audience.recipients.length}. افحصي من جديد.` },
      { status: 409 }
    );
  }

  const batch = body.limit ? audience.recipients.slice(0, body.limit) : audience.recipients;
  const logFile = path.join(getDataDir(), "sms_log.jsonl");
  let sent = 0;
  let failed = 0;

  for (const person of batch) {
    const message = renderFor(text, person.id);
    try {
      const id = await sendSms(person.phone, message);
      sent += 1;
      appendFileSync(
        logFile,
        JSON.stringify({ at: new Date().toISOString(), memberId: person.id, phone: person.phone, ok: true, id, segments: segments(message), by: auth.user.name }) + "\n"
      );
    } catch (error) {
      failed += 1;
      appendFileSync(
        logFile,
        JSON.stringify({ at: new Date().toISOString(), memberId: person.id, phone: person.phone, ok: false, error: error instanceof Error ? error.message : String(error), by: auth.user.name }) + "\n"
      );
    }
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "sms.blast",
    subjectType: "labels",
    subjectId: labelIds.join(","),
    subjectLabel: `${sent} رسالة`,
    detail: `انبعت ${sent} · فشل ${failed} · ${perMessage} مقطع للرسالة`
  });

  void sendTelegramMessage(
    `📨 أفكار · إرسال SMS\nانبعت: ${sent}\nفشل: ${failed}\nمقاطع لكل رسالة: ${perMessage}\nبإيد: ${auth.user.name}`
  ).catch(() => undefined);

  return NextResponse.json({ sent, failed, segments: perMessage });
}
