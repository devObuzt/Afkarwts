import Link from "next/link";
import { notFound } from "next/navigation";
import { getForm, getSubmission } from "@/app/lib/forms/store";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { day } from "../../../../format";
import { SubmissionEditor } from "./SubmissionEditor";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  new: "بانتظار المراجعة",
  added: "في المجموعة",
  rejected: "مرفوض"
};

/**
 * One registration, as somebody sent it — and now correctable.
 *
 * A phone keyed in wrong used to be wrong for good: approval made a member
 * nobody could reach, and nothing in the system could touch the answer.
 */
export default async function SubmissionPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const user = await requireUser("journeys.view");
  const { id, sid } = await params;

  const form = getForm(Number(id));
  const found = getSubmission(Number(sid));

  if (!form || !found || found.submission.formId !== form.id) {
    notFound();
  }

  const { submission, answers } = found;

  // The answers are the medical file; the edit screen is not a way round it.
  if (!can(user, "people.health")) {
    return (
      <div className="crmPage">
        <Link className="crmBack" href={`/new/forms/${form.id}/report`}>
          ← تقرير الاستمارات
        </Link>
        <p className="crmEmpty">
          هذا التسجيل يحوي الإجابات الصحية، وصلاحية «عرض الإجابات الصحية» غير معطاة لحسابك.
        </p>
      </div>
    );
  }

  return (
    <div className="crmPage">
      <Link className="crmBack" href={`/new/forms/${form.id}/report`}>
        ← تقرير الاستمارات
      </Link>

      <header className="crmHead">
        <h1>{submission.name || "تسجيل بلا اسم"}</h1>
        <p>
          {form.groupName} · {form.name} · {day(submission.submittedAt)} ·{" "}
          {STATE_LABEL[submission.state] ?? submission.state}
          {submission.memberId ? " · مرتبط بمنتسب" : ""}
        </p>
      </header>

      <SubmissionEditor
        answers={answers}
        canEdit={can(user, "forms.manage")}
        city={submission.city}
        name={submission.name}
        phone={submission.phone}
        submissionId={submission.id}
      />
    </div>
  );
}
