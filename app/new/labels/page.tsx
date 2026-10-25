import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { listLabels } from "@/app/lib/labels/store";
import { LabelsBoard } from "./LabelsBoard";

export const dynamic = "force-dynamic";

/**
 * Every label in one place.
 *
 * A label here is a group: the مسار somebody is on, the دفعة she started
 * with, a حالة she is in. They were only ever visible one person at a
 * time, so there was nowhere to see them all, colour them, or add one
 * that is not a cohort — «حامل», «نباتي» — which is what a form answer
 * will set later.
 */
export default async function LabelsPage() {
  const user = await requireUser("people.view");

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>الملصقات</h1>
        <p>
          كل مجموعة هي ملصق: المسار، الدفعة، الحالة. كل واحد بلونه، وبينحط على المنتسبة من صفحتها —
          وبعضهن بتحطهن المنظومة لحالها.
        </p>
      </header>

      <LabelsBoard canEdit={can(user, "people.edit")} labels={listLabels()} />
    </div>
  );
}
