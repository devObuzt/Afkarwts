import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { getTemplate, listSteps } from "@/app/lib/journeys/store";
import { listWhatsAppTemplates } from "@/app/lib/whatsapp";
import { PathSteps } from "../../PathSteps";

export const dynamic = "force-dynamic";

/**
 * One path: the flow, written once and run on many groups.
 *
 * Editing it is editing every journey that has not sent that step yet,
 * which is why it lives on its own page rather than inside a cohort.
 */
export default async function EditPathPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("journeys.view");
  const pathId = Number((await params).id);
  const path = Number.isInteger(pathId) ? getTemplate(pathId) : null;
  if (!path) {
    notFound();
  }

  // Meta is the source of truth for what may be sent; an unreachable list
  // leaves the editor read-only rather than offering templates that do
  // not exist.
  const templates = await listWhatsAppTemplates().catch(() => []);

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>{path.name}</h1>
        <p>
          المسار هو الجدول: أي رسالة بأي يوم، مكتوب مرة وحدة وبيمشي على كل مجموعة.{" "}
          <Link href="/new/paths">← المسارات</Link>
        </p>
      </header>

      <PathSteps
        canEdit={can(user, "journeys.manage")}
        pathId={pathId}
        steps={listSteps(pathId).map((step) => ({
          id: step.id,
          week: step.week,
          weekday: step.weekday,
          sendTime: step.sendTime,
          label: step.label,
          freeText: step.freeText,
          templateName: step.templateName,
          templateLanguage: step.templateLanguage,
          templatePreview: step.templatePreview,
          smsText: step.smsText,
          smsUsesFreeText: step.smsUsesFreeText
        }))}
        templates={templates.map((item) => ({
          name: item.name,
          language: item.language,
          status: item.status,
          bodyText: item.bodyText,
          paramCount: item.paramCount
        }))}
      />
    </div>
  );
}
