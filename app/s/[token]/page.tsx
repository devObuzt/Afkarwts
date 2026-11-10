import type { Metadata } from "next";
import { getMember } from "@/app/lib/db";
import { memberIdFromShortToken } from "@/app/lib/members/opt-out-token";
import { StopClient } from "../../stop/[token]/StopClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "إيقاف الرسائل — Afkar",
  robots: { index: false, follow: false }
};

function maskPhone(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length <= 3 ? digits : `${"•".repeat(Math.min(digits.length - 3, 9))}${digits.slice(-3)}`;
}

/**
 * نفس صفحة `/stop/` بالضبط — برابط أقصر للـSMS.
 *
 * 🔑 **والكبسة هي اللي توقف، مش فتح الصفحة.** نفس السبب: الماسحات
 * وبرامج الحماية بتفتح روابط الرسائل لحالها، ولو الـGET هو اللي بيوقف
 * كان التسويق انوقف عن كل اللي استلم الـSMS بلا ما يكبس.
 */
export default async function ShortStopPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const memberId = memberIdFromShortToken(token);
  const member = memberId ? getMember(memberId) : null;

  if (!member) {
    return (
      <main className="formPage" dir="rtl" lang="ar">
        <section className="formCard">
          <h1>الرابط غير صالح</h1>
          <p className="formNote">
            تأكّدي من الرابط اللي وصلك بالرسالة. وإذا بدّك نوقف الرسائل، ابعتي كلمة «وقفوا» على الواتساب
            ورح نوقفها فوراً.
          </p>
        </section>
      </main>
    );
  }

  return <StopClient alreadyStopped={Boolean(member.optOutAt)} masked={maskPhone(member.phone)} token={token} />;
}
