import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { listForms, listSubmissions } from "@/app/lib/forms/store";
import { registrations } from "../format";
import { Registrations } from "./Registrations";

export const dynamic = "force-dynamic";

const STATES = [
  { key: "new", label: "بانتظار المراجعة" },
  { key: "added", label: "في المجموعة" },
  { key: "rejected", label: "مرفوضة" }
] as const;

/**
 * Who registered, and whether they are in.
 *
 * The link is public and nobody joins a cohort by filling it: a
 * registration waits here until someone says yes. That decision lived on
 * the old English `/leads` screen, which is why it was the one step of
 * the week Afkar still had to leave the new workspace to do.
 */
export default async function LeadsPage({
  searchParams
}: {
  searchParams: Promise<{ form?: string; state?: string }>;
}) {
  const user = await requireUser("leads.review");

  const params = await searchParams;
  const formId = Number(params.form) || undefined;
  const state = STATES.some((item) => item.key === params.state) ? params.state! : "new";

  const forms = listForms();
  const rows = listSubmissions({ formId, state });

  // The tabs carry their own counts, so «مرفوضة» is not a door you open to
  // find out whether anything is behind it.
  const counts = Object.fromEntries(
    STATES.map((item) => [item.key, listSubmissions({ formId, state: item.key }).length])
  ) as Record<string, number>;

  const link = (next: { form?: string; state?: string }) => {
    const search = new URLSearchParams();
    const form = next.form ?? (formId ? String(formId) : "");
    if (form) search.set("form", form);
    search.set("state", next.state ?? state);
    return `/new/leads?${search.toString()}`;
  };

  const chosenForm = forms.find((form) => form.id === formId);

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>التسجيلات</h1>
        <p>
          من عبّى الاستمارة بيوصل هون. ما حدا بيدخل المجموعة ولا بيبدأ مسار إلا لما توافقي.
        </p>
      </header>

      {/* Which form, as a plain GET: the view is a link, so it can be kept open. */}
      <form className="crmCard crmPad crmFilters" method="get">
        <label className="crmField">
          <span>الاستمارة</span>
          <select defaultValue={formId ? String(formId) : ""} name="form">
            <option value="">كل الاستمارات</option>
            {forms.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name} ({form.submissionCount})
              </option>
            ))}
          </select>
        </label>
        <input name="state" type="hidden" value={state} />
        <button className="crmBtn primary" type="submit">
          اعرضي
        </button>
        {chosenForm ? (
          <span className="crmNote" style={{ alignSelf: "center" }}>
            الموافقة بتضيفهن لمجموعة <strong>{chosenForm.groupName}</strong>.
          </span>
        ) : (
          <span className="crmNote" style={{ alignSelf: "center" }}>
            كل تسجيل بيروح لمجموعة استمارته.
          </span>
        )}
      </form>

      <nav className="crmFilters" style={{ gap: 8 }}>
        {STATES.map((item) => (
          <Link
            className={item.key === state ? "crmBtn primary" : "crmBtn quiet"}
            href={link({ state: item.key })}
            key={item.key}
          >
            {item.label} ({counts[item.key] ?? 0})
          </Link>
        ))}
      </nav>

      <Registrations
        canEditForms={can(user, "forms.manage")}
        rows={rows.map((row) => ({
          id: row.id,
          formId: row.formId,
          formName: row.formName,
          state: row.state,
          name: row.name,
          phone: row.phone,
          city: row.city,
          submittedAt: row.submittedAt,
          knownMemberId: row.knownMemberId,
          knownMemberName: row.knownMemberName
        }))}
        summary={registrations(rows.length)}
      />
    </div>
  );
}
