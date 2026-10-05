import { ACTION_LABEL, listAudit } from "@/app/lib/users/audit";
import { requireUser } from "@/app/lib/users/current";
import { listUsers } from "@/app/lib/users/store";
import { clock, day } from "../format";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const me = await requireUser("users.manage");
  const users = listUsers();
  const log = listAudit({ limit: 60 });

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>المستخدمون</h1>
        <p>
          لكل شخص حساب، ولكل حساب صلاحياته. الدور يملأ الصلاحيات أول مرة، ثم تُعدَّل واحدة واحدة.
        </p>
      </header>

      <UsersClient meId={me.id} users={users} />

      <section className="crmCard" data-tone="salmon">
        <header>
          <span className="crmDot" />
          <h2>سجل العمليات</h2>
          <span className="crmPill tone spacer">آخر {log.length}</span>
        </header>

        {log.length === 0 ? (
          <p className="crmEmpty">لم يُسجَّل شيء بعد.</p>
        ) : (
          <div className="crmStream">
            {log.map((entry) => (
              <div className="crmEvent" data-kind={entry.action.startsWith("session") ? "joined" : "message"} key={entry.id}>
                <span className="mark" />
                <span className="what">
                  <strong>
                    {entry.actor} — {ACTION_LABEL[entry.action] ?? entry.action}
                  </strong>
                  <span>
                    {entry.subjectLabel}
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </span>
                </span>
                <span className="crmWhen">
                  {day(toIso(entry.createdAt))} {clock(toIso(entry.createdAt))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** SQLite stamps rows without a zone; they are UTC. */
function toIso(value: string) {
  return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}
