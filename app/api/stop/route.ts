import { NextResponse } from "next/server";
import { findMemberByPhone, getMember } from "@/app/lib/db";
import { requestOptOut, undoOptOut } from "@/app/lib/members/opt-out";
import { memberIdFromShortToken, phoneFromOptOutToken } from "@/app/lib/members/opt-out-token";

export const runtime = "nodejs";

/**
 * تنفيذ الهسرة من الرابط.
 *
 * POST وبس بالمقصود: الـGET بتفتحه المعاينات والماسحات لحالها، ولو كان
 * هو اللي بيوقف كان التسويق انوقف عن كل اللي استلم الرسالة.
 *
 * بلا تسجيل دخول — صاحبة الرقم مش مستخدمة بالمنظومة. اللي بيخلّي هاد
 * آمن هو التوكن: فيه الرقم وبصمة عليه، فما حد يقدر يوقف رقم غيره.
 */
export async function POST(request: Request) {
  let body: { token?: string; action?: string };
  try {
    body = (await request.json()) as { token?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  // التوكنان الاثنان بيفوتوا من هون: الطويل من رسالة الواتساب،
  // والقصير من الـSMS. المقارنة بوقت ثابت بالحالتين.
  const token = body.token ?? "";
  const phone = phoneFromOptOutToken(token);
  const shortId = phone ? null : memberIdFromShortToken(token);

  const member = phone
    ? findMemberByPhone(`+${phone}`) ?? findMemberByPhone(phone)
    : shortId
      ? getMember(shortId)
      : null;

  if (!member) {
    return NextResponse.json({ error: "الرابط غير صالح." }, { status: 404 });
  }

  if (body.action === "resume") {
    undoOptOut(member.id, { userId: null, actor: "رابط الرسالة" });
    return NextResponse.json({ ok: true, stopped: false });
  }

  requestOptOut({ memberId: member.id, source: "link", actor: "رابط الرسالة" });
  return NextResponse.json({ ok: true, stopped: true });
}
