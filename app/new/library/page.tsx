import { requireUser } from "@/app/lib/users/current";
import { listTemplates } from "@/app/lib/journeys/store";
import { listForms } from "@/app/lib/forms/store";
import { renderTitle } from "@/app/lib/forms/clean-template";
import { listGroups } from "@/app/lib/db";

export const dynamic = "force-dynamic";

/**
 * The things Afkar builds once and reuses: paths, forms, groups. Separated
 * from the cohorts that run them, because editing a path mid-cohort and
 * starting a new cohort are different days' work.
 */
export default async function LibraryPage() {
  await requireUser("journeys.view");


  const paths = listTemplates();
  const forms = listForms();
  const groups = listGroups();

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>المكتبة</h1>
        <p>ما يُبنى مرة واحدة ويُستعمل في كل مسار: جداول الرسائل والاستمارات والمجموعات.</p>
      </header>

      <section className="crmCard" data-tone="apricot">
        <header>
          <span className="crmDot" />
          <h2>المسارات</h2>
          <a className="crmBtn quiet spacer" href="/journeys">
            تعديل
          </a>
        </header>
        {paths.length === 0 ? (
          <p className="crmEmpty">لا توجد مسارات.</p>
        ) : (
          paths.map((path) => (
            <div className="crmRow" key={path.id}>
              <div className="grow">
                <div className="crmRowTitle">{path.name}</div>
                <div className="crmRowDetail">{path.smsText ? "له نص SMS بديل" : "بلا نص SMS بديل"}</div>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="crmCard" data-tone="mauve">
        <header>
          <span className="crmDot" />
          <h2>الاستمارات</h2>
          <a className="crmBtn quiet spacer" href="/leads">
            تعديل
          </a>
        </header>
        {forms.map((form) => (
          <div className="crmRow" key={form.id}>
            <div className="grow">
              <div className="crmRowTitle">{form.title ? renderTitle(form.title) : form.name}</div>
              <div className="crmRowDetail">
                {form.groupName} · {form.submissionCount} تسجيل
              </div>
            </div>
            <span className={form.status === "open" ? "crmPill live" : "crmPill"}>
              {form.status === "open" ? "مفتوحة" : "مغلقة"}
            </span>
          </div>
        ))}
      </section>

      <section className="crmCard" data-tone="mint">
        <header>
          <span className="crmDot" />
          <h2>المجموعات</h2>
        </header>
        {groups.map((group) => (
          <a className="crmRow" href={`/new/people?group=${group.id}`} key={group.id}>
            <span className="grow">
              <span className="crmRowTitle" style={{ display: "block" }}>
                {group.name}
              </span>
              <span className="crmRowDetail" style={{ display: "block" }}>
                {group.memberCount} شخص
              </span>
            </span>
          </a>
        ))}
      </section>

      <section className="crmCard" data-tone="salmon">
        <header>
          <span className="crmDot" />
          <h2>قوالب واتساب</h2>
          <a className="crmBtn quiet spacer" href="/templates">
            فتح
          </a>
        </header>
        <p className="crmEmpty">
          إدارة القوالب والمجموعات والتجميد ما زالت في الواجهة السابقة.
        </p>
      </section>
    </div>
  );
}
