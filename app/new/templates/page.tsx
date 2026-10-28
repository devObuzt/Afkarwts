import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { TemplatesBoard } from "./TemplatesBoard";

export const dynamic = "force-dynamic";

/**
 * كل قالب على رقم أفكار، وكل اللي بنحتفظ فيه عنه وميتا ما بتعرفه: اسم
 * داخلي بالعربي، وبأي مجموعة هو، وهل لسّه بينعرض وقت بناء خطوة.
 *
 * الشاشة القديمة كانت بالإنجليزي، فاللي بيبني مسار كان لازم يقرا 92 اسم
 * بالشكل `clean_week1_morning_util` ويتذكّر شو جواهن.
 */
export default async function TemplatesPage() {
  const user = await requireUser("journeys.view");

  return (
    <div className="crmPage">
      <Link className="crmBack" href="/new/library">
        ← المكتبة
      </Link>

      <header className="crmHead">
        <h1>قوالب واتساب</h1>
        <p>
          القالب ملك ميتا، والاسم الداخلي والمجموعات إلنا. برّا نافذة الـ24 ساعة القالب هو الطريق الوحيد
          اللي بتوصل فيه رسالة.
        </p>
      </header>

      <TemplatesBoard canManage={can(user, "templates.manage")} />
    </div>
  );
}
