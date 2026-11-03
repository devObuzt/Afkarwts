import type { Metadata } from "next";
import { findMemberByPhone } from "@/app/lib/db";
import { phoneFromOptOutToken } from "@/app/lib/members/opt-out-token";
import { StopClient } from "./StopClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "إيقاف الرسائل — Afkar",
  robots: { index: false, follow: false }
};

/** آخر تلات أرقام وبس: الصفحة عامة، فما بتعرض رقم كامل لحد فتح الرابط. */
function maskPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length <= 3 ? digits : `${"•".repeat(Math.min(digits.length - 3, 9))}${digits.slice(-3)}`;
}

/**
 * صفحة الهسرة.
 *
 * 🔑 **الكبسة هي اللي توقف، مش فتح الصفحة.** واتساب وأندرويد والماسحات
 * بتفتح الروابط لحالها عشان تعمل معاينة — فلو الـGET هو اللي بيوقف، كان
 * كل اللي استلم الرسالة انوقف عنه التسويق بلا ما يكبس. الإيقاف على POST.
 */
export default async function StopPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const phone = phoneFromOptOutToken(token);
  const member = phone ? findMemberByPhone(`+${phone}`) ?? findMemberByPhone(phone) : null;

  if (!phone || !member) {
    return (
      <main className="formPage" dir="rtl" lang="ar">
        <section className="formCard">
          <h1>الرابط غير صالح</h1>
          <p className="formNote">
            تأكّدي من الرابط اللي وصلك بالرسالة. وإذا بدّك نوقف الرسائل، ابعتي كلمة «وقفوا» على نفس المحادثة
            بالواتساب ورح نوقفها فوراً.
          </p>
        </section>
      </main>
    );
  }

  return (
    <StopClient token={token} masked={maskPhone(member.phone)} alreadyStopped={Boolean(member.optOutAt)} />
  );
}
