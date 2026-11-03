import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";
import type { AppTemplateRow } from "@/app/lib/afkar-app/nutrition";
import { TemplateEditor } from "./TemplateEditor";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await requireUser("people.view");
  if (!appConfig()) {
    return (
      <div className="crmPage">
        <header className="crmHead"><h1>قوالب الوجبات</h1><p>تطبيق المنتسبين غير مربوط بهذه النسخة بعد.</p></header>
      </div>
    );
  }
  const list = await appAdmin<{ meal_templates: AppTemplateRow[] }>(user, "/admin/v1/meal-templates");
  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>قوالب الوجبات</h1>
        <p>وجبة بخاناتها وبدائلها: تُبنى مرة وتُستعمل في كل مسار. <Link href="/new/app">← التطبيق</Link></p>
      </header>
      {!list.ok ? (
        <section className="crmCard" data-tone="clay"><p className="crmEmpty">التطبيق لا يرد الآن. حاولي بعد قليل.</p></section>
      ) : (
        <TemplateEditor canEdit={can(user, "people.edit") && canHandleProducts(user.role)} templates={list.data.meal_templates} />
      )}
    </div>
  );
}
