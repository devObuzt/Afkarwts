import { notFound } from "next/navigation";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { listLabels } from "@/app/lib/labels/store";
import { SmsBlast } from "./SmsBlast";

export const dynamic = "force-dynamic";

export default async function SmsPage() {
  // نفس البوابة المزدوجة تبع المسار: بيبعت **و**بيشوف كل الجمهور.
  const user = await requireUser("messages.send");
  if (!can(user, "people.all")) {
    notFound();
  }

  // المسار مش قائمة إرسال — وبينشال من الاختيار أصلاً مش بينرفض بعدين.
  const labels = listLabels().filter((label) => label.kind !== "path" && label.memberCount > 0);

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>إرسال SMS</h1>
        <p>لملصق أو أكثر. المعاينة بتعرض العدد الفعلي والتكلفة قبل أي إرسال.</p>
      </header>
      <SmsBlast labels={labels} />
    </div>
  );
}
