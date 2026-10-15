import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { appConfig } from "@/app/lib/afkar-app/client";
import { loadQueues } from "@/app/lib/afkar-app/queues";
import { ProductQueue, ReviewQueue } from "./Queues";

export const dynamic = "force-dynamic";

export default async function QueuesPage() {
  const user = await requireUser("people.view");

  if (!appConfig()) {
    return (
      <div className="crmPage">
        <header className="crmHead">
          <h1>طلبات التطبيق</h1>
          <p>تطبيق المنتسبين غير مربوط بهذه النسخة بعد.</p>
        </header>
      </div>
    );
  }

  const queues = await loadQueues(user);
  const canEdit = can(user, "people.edit");

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>طلبات التطبيق</h1>
        <p>
          صور أرسلتها المنتسبات لأن الأكل لم يكن بالمكتبة، ومنتجات مسحن باركودها ولم تُعرف بعد. كل قرار هنا يصلها كإشعار.{" "}
          <Link href="/new/app">← التطبيق</Link>
        </p>
      </header>

      {!queues.ok && (
        <section className="crmCard" data-tone="clay">
          <p className="crmEmpty">التطبيق لا يرد الآن. حاولي بعد قليل.</p>
        </section>
      )}

      <ReviewQueue canEdit={canEdit} reviews={queues.reviews} />
      {queues.products !== null && <ProductQueue canEdit={canEdit} products={queues.products} />}
    </div>
  );
}
