import { requireUser } from "@/app/lib/users/current";
import { listTemplates } from "@/app/lib/journeys/store";
import { listForms } from "@/app/lib/forms/store";
import { renderTitle } from "@/app/lib/forms/clean-template";
import { listGroups } from "@/app/lib/db";
import { members } from "../format";
import { can } from "@/app/lib/users/permissions";
import { NewForm } from "./NewForm";

export const dynamic = "force-dynamic";

/**
 * The things Afkar builds once and reuses: paths, forms, groups. Separated
 * from the cohorts that run them, because editing a path mid-cohort and
 * starting a new cohort are different days' work.
 */
export default async function LibraryPage() {
  const user = await requireUser("journeys.view");


  const paths = listTemplates();
  const forms = listForms();
  const groups = listGroups();

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>المكتبة</h1>
        <p>ما يُبنى مرة واحدة ويُستعمل في كل مسار: جداول الرسائل والاستمارات والمجموعات.</p>
      </header>

      <section className="crmCard" data-tone="sage">
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

      <section className="crmCard" data-tone="clay">
        <header>
          <span className="crmDot" />
          <h2>الاستمارات</h2>
        </header>
        {can(user, "forms.manage") && (
          <NewForm
            groups={groups.map((group) => ({
              id: group.id,
              name: group.name,
              memberCount: group.memberCount
            }))}
          />
        )}
        {forms.map((form) => (
          <div className="crmRow" key={form.id}>
            <div className="grow">
              <div className="crmRowTitle">{form.title ? renderTitle(form.title) : form.name}</div>
              <div className="crmRowDetail">
                {form.groupName} · {form.submissionCount} تسجيل
              </div>
            </div>
            {/* «تعديل» sat at the top of the card and went to the old
                English screen, so it read as one button for all the forms
                rather than as a way into this one. */}
            <a className="crmBtn quiet" href={`/new/forms/${form.id}/edit`}>
              تعديل الأسئلة
            </a>
            <a className="crmBtn quiet" href={`/new/forms/${form.id}/report`}>
              التقرير
            </a>
            <span className={form.status === "open" ? "crmPill live" : "crmPill"}>
              {form.status === "open" ? "مفتوحة" : "مغلقة"}
            </span>
          </div>
        ))}
      </section>

      <section className="crmCard" data-tone="olive">
        <header>
          <span className="crmDot" />
          <h2>المجموعات</h2>
        </header>
        {groups.map((group) => {
          // A group's registrations live on the form bound to it, so the
          // report belongs on the group row too — that is where Wisam
          // looks for «من عبّأ الاستمارة» for this group.
          const groupForm = forms.find((candidate) => candidate.groupId === group.id);
          return (
            <div className="crmRow" key={group.id}>
              <a className="grow" href={`/new/people?label=${group.id}`} style={{ textDecoration: "none" }}>
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {group.name}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  {members(group.memberCount)}
                  {groupForm ? ` · ${groupForm.submissionCount} تسجيل` : " · بلا استمارة"}
                </span>
              </a>
              {groupForm && groupForm.submissionCount > 0 && (
                <a className="crmBtn quiet" href={`/new/forms/${groupForm.id}/report`}>
                  تقرير الاستمارات
                </a>
              )}
            </div>
          );
        })}
      </section>

      <section className="crmCard" data-tone="forest">
        <header>
          <span className="crmDot" />
          <h2>قوالب واتساب</h2>
          <a className="crmBtn quiet spacer" href="/new/templates">
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
