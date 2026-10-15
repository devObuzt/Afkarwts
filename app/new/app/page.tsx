import Link from "next/link";
import { requireUser } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { appPrograms, visibleAppMembers, type AppMember } from "@/app/lib/afkar-app/person";
import { loadQueues } from "@/app/lib/afkar-app/queues";

export const dynamic = "force-dynamic";

type Row = AppMember & { afkarwts_person_id: string | null };

export default async function AppPage() {
  const user = await requireUser("people.view");

  if (!appConfig()) {
    return (
      <div className="crmPage">
        <header className="crmHead">
        <h1>التطبيق</h1>
          <p>تطبيق المنتسبين غير مربوط بهذه النسخة بعد.</p>
        </header>
      </div>
    );
  }

  const [members, programs, queues] = await Promise.all([
    appAdmin<{ members: Row[] }>(user, "/admin/v1/members"),
    appPrograms(user),
    loadQueues(user)
  ]);
  const waiting = queues.reviews.length + (queues.products?.length ?? 0);

  const list = members.ok ? visibleAppMembers(members.data.members, { id: user.id, seesAll: can(user, "people.all") }) : [];

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>التطبيق</h1>
        <p>من سُجّل بتطبيق أفكار، ومن دخل إليه. التسجيل بمسار يتم من صفحة الشخص.</p>
      </header>

      <Link className="crmCard" data-tone={waiting ? "clay" : "sage"} href="/new/app/queues" style={{ display: "block", textDecoration: "none" }}>
        <header>
          <span className="crmDot" />
          <h2>طلبات تنتظر</h2>
          <span className="crmPill tone spacer">{waiting}</span>
        </header>
        <p className="crmEmpty">
          صور من المنتسبات: {queues.reviews.length}
          {queues.products !== null && <> · منتجات بالباركود: {queues.products.length}</>}
        </p>
      </Link>

      {!members.ok ? (
        <section className="crmCard" data-tone="clay">
          <p className="crmEmpty">التطبيق لا يرد الآن. حاولي بعد قليل.</p>
        </section>
      ) : (
        <section className="crmCard" data-tone="forest">
          <header>
            <span className="crmDot" />
            <h2>المنتسبون بالتطبيق</h2>
            <span className="crmPill tone spacer">{list.length}</span>
          </header>
          {list.length === 0 ? (
            <p className="crmEmpty">لا أحد بعد.</p>
          ) : (
            list.map((member) => {
              const inner = (
                <>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {member.display_name}
                    </span>
                    <span className="crmRowDetail" dir="ltr" style={{ display: "block", textAlign: "right" }}>
                      {member.phone_e164 ?? "—"}
                    </span>
                  </span>
                  <span className={member.first_login_at ? "crmPill live" : "crmPill"}>
                    {member.first_login_at ? "دخلت" : "لم تدخل بعد"}
                  </span>
                </>
              );
              return member.afkarwts_person_id ? (
                <Link className="crmRow" href={`/new/people/${member.afkarwts_person_id}`} key={member.id}>
                  {inner}
                </Link>
              ) : (
                <div className="crmRow" key={member.id}>
                  {inner}
                </div>
              );
            })
          )}
        </section>
      )}

      <section className="crmCard" data-tone="sage">
        <header>
          <span className="crmDot" />
          <h2>المسارات بالتطبيق</h2>
        </header>
        {!programs.ok || programs.data.length === 0 ? (
          <p className="crmEmpty">لا توجد مسارات بعد.</p>
        ) : (
          programs.data.map((program) => (
            <div className="crmRow" key={program.id}>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {program.name}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  {program.length_days} يوم · {program.key}
                </span>
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
