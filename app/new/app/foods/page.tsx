import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";
import type { AppFood } from "@/app/lib/afkar-app/nutrition";
import { FoodLibrary } from "./FoodLibrary";

export const dynamic = "force-dynamic";

export default async function FoodsPage() {
  const user = await requireUser("people.view");
  if (!appConfig()) {
    return (
      <div className="crmPage">
        <header className="crmHead"><h1>مكتبة الأطعمة</h1><p>تطبيق المنتسبين غير مربوط بهذه النسخة بعد.</p></header>
      </div>
    );
  }
  const list = await appAdmin<{ foods: AppFood[] }>(user, "/admin/v1/foods");
  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>مكتبة الأطعمة</h1>
        <p>منها تُبنى الوجبات، ومنها تأخذ المنتسبة كل الأرقام. طلبات الباركود في <Link href="/new/app/queues">الطلبات</Link>. <Link href="/new/app">← التطبيق</Link></p>
      </header>
      {!list.ok ? (
        <section className="crmCard" data-tone="clay"><p className="crmEmpty">التطبيق لا يرد الآن. حاولي بعد قليل.</p></section>
      ) : (
        <FoodLibrary canEdit={can(user, "people.edit") && canHandleProducts(user.role)} recent={list.data.foods} />
      )}
    </div>
  );
}
