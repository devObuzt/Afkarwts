import { requireUser } from "@/app/lib/users/current";
import Link from "next/link";
import { listGroups } from "@/app/lib/db";
import { listPeople } from "@/app/lib/people";
import { ago, hueOf, initials, people as peopleCount } from "../format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function PeoplePage({

  searchParams
}: {
  searchParams: Promise<{ q?: string; group?: string; page?: string }>;
}) {
  await requireUser("people.view");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const groupId = Number(params.group) || null;
  const page = Math.max(Number(params.page) || 1, 1);

  const { people, total } = listPeople({ query, groupId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const groups = listGroups();
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const linkTo = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (groupId) search.set("group", String(groupId));
    if (nextPage > 1) search.set("page", String(nextPage));
    const suffix = search.toString();
    return suffix ? `/new/people?${suffix}` : "/new/people";
  };

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>الناس</h1>
        <p>
          {peopleCount(total)}
          {query || groupId ? " بهذا الفلتر" : ""}.
        </p>
      </header>

      {/* A plain GET form: searching is a link, so it can be shared and gone back to. */}
      <form className="crmCard crmPad crmSearch" method="get">
        <label className="crmField">
          <span>بحث بالاسم، البلد أو التلفون</span>
          <input defaultValue={query} name="q" placeholder="ليلى · عرابة · 0521234567" type="search" />
        </label>
        <label className="crmField" style={{ flex: "1 1 200px" }}>
          <span>المجموعة</span>
          <select defaultValue={groupId ? String(groupId) : ""} name="group">
            <option value="">الكل</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} ({group.memberCount})
              </option>
            ))}
          </select>
        </label>
        <button className="crmBtn primary" style={{ alignSelf: "flex-end" }} type="submit">
          دوّري
        </button>
      </form>

      <section className="crmCard">
        {people.length === 0 ? (
          <p className="crmEmpty">ما في ولا نتيجة. جرّبي اسم أقصر، أو شيلي الفلتر.</p>
        ) : (
          people.map((person) => (
            <Link className="crmRow" href={`/new/people/${person.id}`} key={person.id}>
              <span className="crmAvatar" data-hue={hueOf(person.name)}>
                {initials(person.name)}
              </span>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {person.name}
                  {person.unread > 0 && (
                    <span className="crmPill alert" style={{ marginInlineStart: 8 }}>
                      {person.unread} جديد
                    </span>
                  )}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  <span className="crmLtr">{person.phone}</span>
                  {person.city ? ` · ${person.city}` : ""}
                  {person.cohort ? ` · ${person.cohort}` : ""}
                  {person.files ? ` · ${person.files} ملف` : ""}
                </span>
              </span>
              <span className="crmWhen">{person.lastAt ? ago(person.lastAt) : "بلا محادثة"}</span>
            </Link>
          ))
        )}
      </section>

      {pages > 1 && (
        <nav className="crmSearch" style={{ justifyContent: "space-between" }}>
          {page > 1 ? (
            <Link className="crmBtn" href={linkTo(page - 1)}>
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="crmNote">
            صفحة {page} من {pages}
          </span>
          {page < pages ? (
            <Link className="crmBtn" href={linkTo(page + 1)}>
              الجاي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
