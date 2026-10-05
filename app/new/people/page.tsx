import { requireUser } from "@/app/lib/users/current";
import Link from "next/link";
import { listLabels } from "@/app/lib/labels/store";
import { KIND_LABEL, KIND_TONE, type LabelKind } from "@/app/lib/labels/kinds";
import { can } from "@/app/lib/users/permissions";
import { listPeople } from "@/app/lib/people";
import { ago, hueOf, initials, people as peopleCount } from "../format";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function PeoplePage({

  searchParams
}: {
  searchParams: Promise<{ q?: string; label?: string | string[]; page?: string }>;
}) {
  const user = await requireUser("people.view");

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const chosen = (Array.isArray(params.label) ? params.label : params.label ? [params.label] : [])
    .map(Number)
    .filter(Number.isInteger);
  const page = Math.max(Number(params.page) || 1, 1);

  // Without people.all a user sees only the members assigned to them, which
  // is how a coach follows her own group and nobody else's.
  const { people, total } = listPeople({
    query,
    labelIds: chosen,
    onlyAssignedTo: can(user, "people.all") ? null : user.id,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE
  });
  const labels = listLabels().filter((label) => label.memberCount > 0);
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const link = (next: { page?: number; label?: number[] }) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    for (const id of next.label ?? chosen) {
      search.append("label", String(id));
    }
    if ((next.page ?? 1) > 1) search.set("page", String(next.page));
    const suffix = search.toString();
    return suffix ? `/new/people?${suffix}` : "/new/people";
  };

  const toggle = (id: number) =>
    link({ label: chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id] });

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>المنتسبون</h1>
        <p>
          {peopleCount(total)}
          {query || chosen.length ? " ضمن هذا الفلتر" : ""}.
        </p>
      </header>

      {/* A plain GET form: searching is a link, so it can be shared and gone back to. */}
      <form className="crmCard crmPad crmSearch" method="get">
        <label className="crmField">
          <span>بحث بالاسم أو البلدة أو رقم الهاتف</span>
          <input defaultValue={query} name="q" placeholder="ليلى · عرابة · 0521234567" type="search" />
        </label>
        {chosen.map((id) => (
          <input key={id} name="label" type="hidden" value={id} />
        ))}
        <button className="crmBtn primary" style={{ alignSelf: "flex-end" }} type="submit">
          بحث
        </button>
      </form>

      <section className="crmCard crmPad">
        {(["state", "path", "batch", "coach", "other"] as LabelKind[]).map((kind) => {
          const ofKind = labels.filter((label) => label.kind === kind);
          if (!ofKind.length) {
            return null;
          }
          return (
            <div key={kind} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--faint)", marginBottom: 7 }}>
                {KIND_LABEL[kind]}
              </div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {ofKind.map((label) => (
                  <Link
                    className={chosen.includes(label.id) ? "crmBtn quiet primary" : "crmBtn quiet"}
                    href={toggle(label.id)}
                    key={label.id}
                  >
                    {label.name} <span style={{ opacity: 0.65 }}>{label.memberCount}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {chosen.length > 1 && (
          <p className="crmNote">الملصقات المختارة تضيق معاً: النتيجة من يحمل كل واحد منها.</p>
        )}
      </section>

      <section className="crmCard">
        {people.length === 0 ? (
          <p className="crmEmpty">لا توجد نتائج. جرّب اسماً أقصر أو أزل الفلتر.</p>
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
                  {person.coach ? ` · ${person.coach}` : ""}
                  {person.files ? ` · ${person.files} ملف` : ""}
                </span>
                {person.labels.length > 0 && (
                  <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
                    {person.labels.slice(0, 4).map((label) => (
                      <span
                        className="crmPill"
                        data-tone={KIND_TONE[label.kind as LabelKind] ?? "salmon"}
                        key={label.id}
                        style={{ background: "var(--tone-wash)", color: "var(--tone-ink)", fontSize: 11 }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="crmWhen">{person.lastAt ? ago(person.lastAt) : "بلا محادثة"}</span>
            </Link>
          ))
        )}
      </section>

      {pages > 1 && (
        <nav className="crmSearch" style={{ justifyContent: "space-between" }}>
          {page > 1 ? (
            <Link className="crmBtn" href={link({ page: page - 1 })}>
              السابق
            </Link>
          ) : (
            <span />
          )}
          <span className="crmNote">
            صفحة {page} من {pages}
          </span>
          {page < pages ? (
            <Link className="crmBtn" href={link({ page: page + 1 })}>
              التالي
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
