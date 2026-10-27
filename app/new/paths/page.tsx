import { requireUser } from "@/app/lib/users/current";
import Link from "next/link";
import { getGroup } from "@/app/lib/db";
import { listJourneys, getTemplate, listTemplates } from "@/app/lib/journeys/store";
import { listGroups } from "@/app/lib/db";
import { RunControls } from "./RunControls";
import { StartJourney } from "./StartJourney";
import { listForms, listSubmissions } from "@/app/lib/forms/store";
import { day } from "../format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; pill: string }> = {
  active: { label: "يعمل", pill: "crmPill live" },
  draft: { label: "مسودة", pill: "crmPill" },
  paused: { label: "موقوف", pill: "crmPill open" },
  done: { label: "انتهى", pill: "crmPill" }
};

export default async function CohortsPage() {
  await requireUser("journeys.view");


  const journeys = listJourneys().map((journey) => ({
    ...journey,
    pathName: getTemplate(journey.templateId)?.name ?? `#${journey.templateId}`,
    groupName: getGroup(journey.groupId)?.name ?? `#${journey.groupId}`
  }));

  const forms = listForms();
  const waiting = listSubmissions({ state: "new" });

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>المسارات</h1>
        <p>كل مسار: مجموعة منتسبين، وجدول رسائل، واستمارة تسجيل. من هنا يظهر ما وصل إليه كل منتسب.</p>
      </header>

      {waiting.length > 0 && (
        <section className="crmCard" data-tone="clay">
          <header>
            <span className="crmDot" />
            <h2>تسجيلات بانتظار المراجعة</h2>
            <span className="crmPill alert spacer">{waiting.length}</span>
          </header>
          {waiting.slice(0, 12).map((submission) => (
            <div className="crmRow" key={submission.id}>
              <div className="grow">
                <div className="crmRowTitle">{submission.name || "بلا اسم"}</div>
                <div className="crmRowDetail">
                  <span className="crmLtr">{submission.phone}</span>
                  {submission.city ? ` · ${submission.city}` : ""} · {submission.formName}
                  {submission.knownMemberName ? ` · مسجّل مسبقاً باسم ${submission.knownMemberName}` : ""}
                </div>
              </div>
              {/* Before approval is the moment a typo is worth catching:
                  after it, the member exists with the wrong number. */}
              <Link
                className="crmBtn quiet"
                href={`/new/forms/${submission.formId}/submissions/${submission.id}`}
              >
                تعديل
              </Link>
            </div>
          ))}
          <div className="crmPad" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <a className="crmBtn primary" href="/leads">
              المراجعة في صفحة التسجيلات
            </a>
            <p className="crmNote" style={{ marginTop: 10 }}>
              الموافقة ما زالت في الواجهة السابقة، وتنتقل إلى هنا بعد اكتمال تجربة المسار.
            </p>
          </div>
        </section>
      )}

      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>المسارات قيد التشغيل</h2>
        </header>

        <div className="crmPad">
          <StartJourney
            groups={listGroups().map((group) => ({ id: group.id, name: group.name, memberCount: group.memberCount }))}
            paths={listTemplates().map((template) => ({ id: template.id, name: template.name }))}
          />
        </div>
        {journeys.length === 0 ? (
          <p className="crmEmpty">لا توجد مسارات بعد.</p>
        ) : (
          journeys.map((journey) => (
            <Link className="crmRow" href={`/new/paths/${journey.id}`} key={journey.id}>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {journey.groupName}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  {journey.pathName} · بدأ {day(`${journey.anchorDate}T00:00:00.000Z`)}
                </span>
              </span>
              <span className={STATUS[journey.status]?.pill ?? "crmPill"}>
                {STATUS[journey.status]?.label ?? journey.status}
              </span>
            </Link>
          ))
        )}
      </section>

      <section className="crmCard" data-tone="clay">
        <header>
          <span className="crmDot" />
          <h2>استمارات التسجيل</h2>
        </header>
        {forms.length === 0 ? (
          <p className="crmEmpty">لا توجد استمارات.</p>
        ) : (
          forms.map((form) => (
            <div className="crmRow" key={form.id}>
              <div className="grow">
                <div className="crmRowTitle">{form.name}</div>
                <div className="crmRowDetail">
                  {form.groupName} · {form.submissionCount} تسجيل
                  {form.newCount ? ` · ${form.newCount} بانتظار المراجعة` : ""}
                </div>
              </div>
              <Link className="crmBtn quiet" href={`/new/forms/${form.id}/edit`}>
                تعديل الأسئلة
              </Link>
              <Link className="crmBtn quiet" href={`/new/forms/${form.id}/report`}>
                تقرير الاستمارات
              </Link>
              <a className="crmBtn quiet" href={`/f/${form.token}`} rel="noreferrer" target="_blank">
                فتح الرابط
              </a>
              <span className={form.status === "open" ? "crmPill live" : "crmPill"}>
                {form.status === "open" ? "مفتوحة" : "مغلقة"}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
