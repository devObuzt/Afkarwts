import Link from "next/link";
import { getGroup } from "@/app/lib/db";
import { listJourneys, getTemplate } from "@/app/lib/journeys/store";
import { listForms, listSubmissions } from "@/app/lib/forms/store";
import { day } from "../format";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; pill: string }> = {
  active: { label: "شغّالة", pill: "crmPill live" },
  draft: { label: "مسوّدة", pill: "crmPill" },
  paused: { label: "موقوفة", pill: "crmPill open" },
  done: { label: "خلصت", pill: "crmPill" }
};

export default function CohortsPage() {
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
        <h1>الدورات</h1>
        <p>كل دورة = مجموعة + مسار رسائل + استمارة تسجيل. من هون بتشوفي وين وصلت كل وحدة.</p>
      </header>

      {waiting.length > 0 && (
        <section className="crmCard">
          <header>
            <span className="crmDot" />
            <h2>تسجيلات مستنّية مراجعة</h2>
            <span className="crmPill alert spacer">{waiting.length}</span>
          </header>
          {waiting.slice(0, 12).map((submission) => (
            <div className="crmRow" key={submission.id}>
              <div className="grow">
                <div className="crmRowTitle">{submission.name || "بلا اسم"}</div>
                <div className="crmRowDetail">
                  <span className="crmLtr">{submission.phone}</span>
                  {submission.city ? ` · ${submission.city}` : ""} · {submission.formName}
                  {submission.knownMemberName ? ` · موجودة عندك باسم ${submission.knownMemberName}` : ""}
                </div>
              </div>
            </div>
          ))}
          <div className="crmPad" style={{ borderTop: "1px solid var(--line-soft)" }}>
            <a className="crmBtn primary" href="/leads">
              راجعيهن بصفحة الليدز
            </a>
            <p className="crmNote" style={{ marginTop: 10 }}>
              الموافقة لسّه بالواجهة القديمة — بتنقل لهون لما تخلص تجربة كل المسار.
            </p>
          </div>
        </section>
      )}

      <section className="crmCard">
        <header>
          <h2>المسارات الشغّالة</h2>
        </header>
        {journeys.length === 0 ? (
          <p className="crmEmpty">ولا دورة لهلق.</p>
        ) : (
          journeys.map((journey) => (
            <Link className="crmRow" href={`/new/cohorts/${journey.id}`} key={journey.id}>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {journey.groupName}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  {journey.pathName} · بلّشت {day(`${journey.anchorDate}T00:00:00.000Z`)}
                </span>
              </span>
              <span className={STATUS[journey.status]?.pill ?? "crmPill"}>
                {STATUS[journey.status]?.label ?? journey.status}
              </span>
            </Link>
          ))
        )}
      </section>

      <section className="crmCard">
        <header>
          <h2>استمارات التسجيل</h2>
        </header>
        {forms.length === 0 ? (
          <p className="crmEmpty">ولا استمارة.</p>
        ) : (
          forms.map((form) => (
            <div className="crmRow" key={form.id}>
              <div className="grow">
                <div className="crmRowTitle">{form.name}</div>
                <div className="crmRowDetail">
                  {form.groupName} · {form.submissionCount} تسجيل
                  {form.newCount ? ` · ${form.newCount} مستنّي` : ""}
                </div>
              </div>
              <a className="crmBtn quiet" href={`/f/${form.token}`} rel="noreferrer" target="_blank">
                افتحي الرابط
              </a>
              <span className={form.status === "open" ? "crmPill live" : "crmPill"}>
                {form.status === "open" ? "مفتوحة" : "مسكّرة"}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
