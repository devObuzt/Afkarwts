import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { appPrograms } from "@/app/lib/afkar-app/person";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";
import type { AppTemplateRow } from "@/app/lib/afkar-app/nutrition";
import { ProgramEditor } from "./ProgramEditor";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const user = await requireUser("people.view");
  if (!appConfig()) {
    return (
      <div className="crmPage">
        <header className="crmHead"><h1>قوالب المسارات</h1><p>تطبيق المنتسبين غير مربوط بهذه النسخة بعد.</p></header>
      </div>
    );
  }
  const [programs, templates] = await Promise.all([
    appPrograms(user),
    appAdmin<{ meal_templates: AppTemplateRow[] }>(user, "/admin/v1/meal-templates")
  ]);
  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>قوالب المسارات</h1>
        <p>المسار أيام من <Link href="/new/app/templates">قوالب الوجبات</Link> وأهداف ويوم وزن. تُسجَّل المنتسبة به من صفحتها. <Link href="/new/app">← التطبيق</Link></p>
      </header>
      {!programs.ok || !templates.ok ? (
        <section className="crmCard" data-tone="clay"><p className="crmEmpty">التطبيق لا يرد الآن. حاولي بعد قليل.</p></section>
      ) : (
        <ProgramEditor canEdit={can(user, "people.edit") && canHandleProducts(user.role)} programs={programs.data} templates={templates.data.meal_templates} />
      )}
    </div>
  );
}
