import Link from "next/link";
import { getToday } from "@/app/lib/today";
import { ago, clock, initials, members, weekdayAndDay } from "./format";

export const dynamic = "force-dynamic";

function openingLine(counts: { decisions: number; cohorts: number }) {
  const parts: string[] = [];

  if (counts.decisions === 0) {
    parts.push("ما في إشي مستنّي قرار منك");
  } else if (counts.decisions === 1) {
    parts.push("في إشي واحد بده قرار منك");
  } else {
    parts.push(`عندك ${counts.decisions} أشياء بدها قرار منك`);
  }

  if (counts.cohorts === 1) {
    parts.push("ودورة شغّالة");
  } else if (counts.cohorts > 1) {
    parts.push(`و${counts.cohorts} دورات شغّالات`);
  }

  return `${parts.join("، ")}.`;
}

export default function TodayPage() {
  const now = new Date();
  const today = getToday(now);

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>مراحب أفكار</h1>
        <p>
          {weekdayAndDay(now)} · {openingLine({ decisions: today.decisions.length, cohorts: today.cohorts.length })}
        </p>
      </header>

      <section className="crmCard">
        <header>
          <span className={today.decisions.length ? "crmDot" : "crmDot calm"} />
          <h2>بدها قرار منك</h2>
        </header>

        {today.decisions.length === 0 ? (
          <p className="crmEmpty">كلشي ماشي. الدورات بتبعت لحالها، وما في ولا إشي عالق.</p>
        ) : (
          today.decisions.map((item) => (
            <div className="crmRow" key={item.key}>
              <div className="grow">
                <div className="crmRowTitle">{item.title}</div>
                <div className="crmRowDetail">{item.detail}</div>
              </div>
              <Link className={item.weight === "now" ? "crmBtn primary" : "crmBtn"} href={item.href}>
                {item.action}
              </Link>
            </div>
          ))
        )}
      </section>

      {today.cohorts.length > 0 && (
        <section className="crmGrid">
          {today.cohorts.map((cohort) => (
            <article className="crmCard" key={cohort.journeyId}>
              <div className="crmPad">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    <Link href={`/new/cohorts/${cohort.journeyId}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {cohort.groupName || cohort.pathName}
                    </Link>
                  </h2>
                  <span className={cohort.status === "active" ? "crmPill live" : "crmPill open"}>
                    {cohort.status === "active" ? "شغّالة" : "موقوفة"}
                  </span>
                </div>
                <div className="crmRowDetail" style={{ marginTop: 10 }}>
                  {members(cohort.members)} · {cohort.pathName}
                  <br />
                  {cohort.nextAt
                    ? `الجاي: ${weekdayAndDay(new Date(cohort.nextAt))} ${clock(cohort.nextAt)} — «${cohort.nextLabel}»`
                    : "خلصت كل الخطوات"}
                </div>
                <div className="crmMeter">
                  <span
                    style={{
                      width: `${cohort.stepsTotal ? Math.min(100, Math.round((cohort.stepsSent / cohort.stepsTotal) * 100)) : 0}%`
                    }}
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="crmCard">
        <header>
          <h2>ردود مستنّية</h2>
          <Link className="spacer" href="/new/people" style={{ fontSize: 13.5 }}>
            كل الناس ←
          </Link>
        </header>

        {today.replies.length === 0 ? (
          <p className="crmEmpty">ما في ولا رسالة بلا جواب.</p>
        ) : (
          today.replies.map((reply) => (
            <Link className="crmRow" href={`/new/people/${reply.memberId}`} key={reply.memberId}>
              <span className="crmAvatar warm">{initials(reply.name)}</span>
              <span className="grow">
                <span className="crmRowTitle" style={{ display: "block" }}>
                  {reply.name}
                </span>
                <span className="crmRowDetail" style={{ display: "block" }}>
                  {reply.body.slice(0, 90)}
                </span>
              </span>
              <span className="crmWhen">{ago(reply.at, now)}</span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
