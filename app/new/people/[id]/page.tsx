import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonRecord } from "@/app/lib/people";
import { ago, clock, day, hueOf, initials } from "../../format";
import { PersonFiles } from "./PersonFiles";
import { PersonNotes } from "./PersonNotes";
import { PersonReply } from "./PersonReply";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  active: "شغّالة",
  stopped: "وقفت",
  completed: "خلّصت",
  removed: "انشالت"
};

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const record = getPersonRecord(Number((await params).id));

  if (!record) {
    notFound();
  }

  const { member } = record;
  const registration = record.submissions[0];
  const openTasks = record.tasks.filter((task) => task.state === "open" || task.state === "failed");

  return (
    <div className="crmPage wide">
      <Link className="crmBack" href="/new/people">
        ← الناس
      </Link>

      <header
        className="crmCard crmTile crmPad"
        data-tone="mauve"
        style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}
      >
        <span className="crmAvatar big" data-hue={hueOf(member.name)}>
          {initials(member.name)}
        </span>
        <div style={{ flex: "999 1 240px", minWidth: 0 }}>
          <h1 style={{ margin: "0 0 5px", fontSize: 24, fontWeight: 700 }}>{member.name}</h1>
          <div className="crmRowDetail">
            <span className="crmLtr">{member.phone}</span>
            {member.city ? ` · ${member.city}` : ""}
            {member.joined ? ` · من ${member.joined}` : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
            {record.groups.map((group) => (
              <span className="crmPill" key={group.id}>
                {group.name}
              </span>
            ))}
            {record.groups.length === 0 && <span className="crmPill">بلا مجموعة</span>}
          </div>
        </div>
        <a
          className="crmBtn"
          href={`https://wa.me/${member.phone.replace(/\D/g, "")}`}
          rel="noreferrer"
          target="_blank"
        >
          واتساب
        </a>
      </header>

      {openTasks.length > 0 && (
        <section className="crmCard" data-tone="rose">
          <header>
            <span className="crmDot" />
            <h2>بدها منك</h2>
          </header>
          {openTasks.map((task) => (
            <div className="crmRow" key={task.id}>
              <div className="grow">
                <div className="crmRowTitle">{task.reason || "متابعة"}</div>
                <div className="crmRowDetail">
                  {task.kind === "sms" ? "الـSMS البديل" : "تواصل يدوي"} · {ago(task.createdAt)}
                  {task.body && task.body !== task.reason ? ` · ${task.body.slice(0, 120)}` : ""}
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      <div className="crmSplit">
        <div className="main">
          {record.highlights.length > 0 && (
            <div className="crmHighlight">
              <h3>لازم تعرفيه قبل ما تبني إلها متكون</h3>
              <dl>
                {record.highlights.map((highlight) => (
                  <div key={highlight.label}>
                    <dt>{highlight.label}</dt>
                    <dd>{highlight.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <PersonFiles files={record.files} memberId={member.id} />

          <section className="crmCard" data-tone="salmon">
            <header>
              <span className="crmDot" />
              <h2>كل اللي صار</h2>
              <span className="crmPill tone spacer">{record.timeline.length}</span>
            </header>
            {record.timeline.length === 0 ? (
              <p className="crmEmpty">لسّه ما صار إشي.</p>
            ) : (
              <div className="crmStream">
                {record.timeline.slice(0, 60).map((entry, index) => (
                  <div className="crmEvent" data-kind={entry.kind} key={`${entry.at}-${index}`}>
                    <span className="mark" />
                    <span className="what">
                      <strong>{entry.title}</strong>
                      <span>{entry.detail}</span>
                    </span>
                    <span className="crmWhen">
                      {day(entry.at)} {clock(entry.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {registration && (
            <section className="crmCard" data-tone="mauve">
              <header>
                <span className="crmDot" />
                <h2>استمارتها</h2>
                <span className="crmPill tone spacer">{registration.formName}</span>
              </header>
              <div className="crmPad crmAnswers">
                {registration.answers
                  .filter((answer) => answer.value.trim())
                  .map((answer) => (
                    <div key={answer.label}>
                      <dt>{answer.label}</dt>
                      <dd>
                        {answer.value.startsWith("data:image") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt={answer.label} src={answer.value} />
                        ) : (
                          answer.value
                        )}
                      </dd>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>

        <div className="side">
          <PersonReply
            memberId={member.id}
            windowClosesAt={record.windowClosesAt}
            windowOpen={record.windowOpen}
          />

          <section className="crmCard" data-tone="apricot">
            <header>
              <span className="crmDot" />
              <h2>دوراتها</h2>
            </header>
            {record.journeys.length === 0 ? (
              <p className="crmEmpty">ولا دورة.</p>
            ) : (
              record.journeys.map((journey) => (
                <Link className="crmRow" href={`/new/cohorts/${journey.journeyId}`} key={journey.journeyId}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {journey.groupName || journey.pathName}
                    </span>
                    <span className="crmRowDetail" style={{ display: "block" }}>
                      {journey.anchorDate} · {journey.sent} انبعتت · {journey.read} انقرأت
                      {journey.stopReason ? ` · ${journey.stopReason}` : ""}
                    </span>
                  </span>
                  <span className={journey.state === "active" ? "crmPill live" : "crmPill"}>
                    {STATE_LABEL[journey.state] ?? journey.state}
                  </span>
                </Link>
              ))
            )}
          </section>

          <PersonNotes memberId={member.id} notes={member.notes} />

          <dl className="crmCard crmPad crmFacts">
            <dt>رسائل</dt>
            <dd>{record.messages.length}</dd>
            <dt>استمارات</dt>
            <dd>{record.submissions.length}</dd>
            <dt>ملفات</dt>
            <dd>{record.files.length}</dd>
            <dt>انضمّت</dt>
            <dd>{member.createdAt.slice(0, 10)}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
