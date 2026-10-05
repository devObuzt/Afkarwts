import Link from "next/link";
import { getToday } from "@/app/lib/today";
import { ago, clock, hueOf, initials, items, members, paths as pathCount, weekdayAndDay } from "./format";

export const dynamic = "force-dynamic";

function openingLine(counts: { decisions: number; paths: number }) {
  const parts = [
    counts.decisions === 0 ? "لا شيء بانتظار قرار" : `${items(counts.decisions)} بانتظار قرار`
  ];

  if (counts.paths > 0) {
    parts.push(`و${pathCount(counts.paths)} قيد التشغيل`);
  }

  return `${parts.join("، ")}.`;
}

export default function TodayPage() {
  const now = new Date();
  const today = getToday(now);

  return (
    <div className="crmPage">
      <header className="crmHead">
        <h1>اليوم</h1>
        <p>
          {weekdayAndDay(now)} · {openingLine({ decisions: today.decisions.length, paths: today.paths.length })}
        </p>
      </header>

      <section className="crmCard" data-tone={today.decisions.length ? "rose" : "mint"}>
        <header>
          <span className="crmDot" />
          <h2>بانتظار قرار</h2>
        </header>

        {today.decisions.length === 0 ? (
          <p className="crmEmpty">لا شيء معلّق. المسارات ترسل من تلقائها.</p>
        ) : (
          today.decisions.map((item) => (
            <div className="crmRow" data-tone={item.weight === "now" ? "rose" : "apricot"} key={item.key}>
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

      {today.paths.length > 0 && (
        <section className="crmGrid">
          {today.paths.map((item) => (
            <article className="crmCard crmTile" data-tone={item.status === "active" ? "mint" : "apricot"} key={item.journeyId}>
              <div className="crmPad">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    <Link href={`/new/paths/${item.journeyId}`} style={{ textDecoration: "none", color: "inherit" }}>
                      {item.groupName || item.pathName}
                    </Link>
                  </h2>
                  <span className={item.status === "active" ? "crmPill live" : "crmPill open"}>
                    {item.status === "active" ? "يعمل" : "موقوف"}
                  </span>
                </div>
                <div className="crmRowDetail" style={{ marginTop: 10 }}>
                  {members(item.members)} · {item.pathName}
                  <br />
                  {item.nextAt
                    ? `التالي: ${weekdayAndDay(new Date(item.nextAt))} ${clock(item.nextAt)} — «${item.nextLabel}»`
                    : "انتهت كل الخطوات"}
                </div>
                <div className="crmMeter">
                  <span
                    style={{
                      width: `${item.stepsTotal ? Math.min(100, Math.round((item.stepsSent / item.stepsTotal) * 100)) : 0}%`
                    }}
                  />
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="crmCard" data-tone="mauve">
        <header>
          <span className="crmDot" />
          <h2>ردود بلا جواب</h2>
          <Link className="spacer" href="/new/people" style={{ fontSize: 13.5 }}>
            كل المنتسبين ←
          </Link>
        </header>

        {today.replies.length === 0 ? (
          <p className="crmEmpty">لا توجد رسالة بلا جواب.</p>
        ) : (
          today.replies.map((reply) => (
            <Link className="crmRow" href={`/new/people/${reply.memberId}`} key={reply.memberId}>
              <span className="crmAvatar" data-hue={hueOf(reply.name)}>
                {initials(reply.name)}
              </span>
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
