import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";
import type { AppExercise } from "@/app/lib/afkar-app/training";
import { ExerciseLibrary } from "./ExerciseLibrary";

export const dynamic = "force-dynamic";

export default async function ExercisesPage() {
  const user = await requireUser("people.view");
  if (!appConfig()) {
    return (
      <div className="crmPage">
        <header className="crmHead"><h1>مكتبة التمارين</h1><p>تطبيق المنتسبين غير مربوط بهذه النسخة بعد.</p></header>
      </div>
    );
  }
  const list = await appAdmin<{ exercises: AppExercise[] }>(user, "/admin/v1/exercises");
  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>مكتبة التمارين</h1>
        <p>التمارين التي تُبنى منها خطط التدريب في التطبيق. كل تمرين يُعدّ بالتكرارات أو بالدقائق. <Link href="/new/app">← التطبيق</Link></p>
      </header>
      {!list.ok ? (
        <section className="crmCard" data-tone="clay"><p className="crmEmpty">التطبيق لا يرد الآن. حاولي بعد قليل.</p></section>
      ) : (
        <ExerciseLibrary canEdit={can(user, "people.edit") && canHandleProducts(user.role)} exercises={list.data.exercises} />
      )}
    </div>
  );
}
