import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm, listFields, listSubmissions } from "@/app/lib/forms/store";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { questions, registrations } from "../../../format";
import { FormEditor } from "./FormEditor";

export const dynamic = "force-dynamic";

/**
 * The registration form itself, in Arabic and inside the CRM.
 *
 * The editor existed — nine field kinds, conditions, reordering — but only
 * on the old `/leads` screen, in English, which is why Afkar's team could
 * not find it.
 */
export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("journeys.view");
  const form = getForm(Number((await params).id));

  if (!form) {
    notFound();
  }

  const fields = listFields(form.id);
  const submissions = listSubmissions({ formId: form.id }).length;

  return (
    <div className="crmPage wide">
      <Link className="crmBack" href="/new/library">
        ← المكتبة
      </Link>

      <header className="crmHead">
        <h1>تعديل الاستمارة</h1>
        <p>
          {form.groupName} · {form.name} · {questions(fields.length)} · {registrations(submissions)}
        </p>
      </header>

      <FormEditor
        canEdit={can(user, "forms.manage")}
        fields={fields}
        form={{ id: form.id, name: form.name, intro: form.intro, status: form.status, token: form.token }}
        submissions={submissions}
      />
    </div>
  );
}
