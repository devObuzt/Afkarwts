import { requireUser } from "@/app/lib/users/current";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/app/lib/db";
import { journeyFunnel, journeyLabel, stepBreakdown } from "@/app/lib/journeys/report";
import { getJourney } from "@/app/lib/journeys/store";
import { clock, day, hueOf, initials, members as memberCount } from "../../format";

export const dynamic = "force-dynamic";

type MemberRow = {
  member_id: number;
  name: string;
  phone: string;
  state: string;
  stop_reason: string | null;
  sent: number;
  read: number;
  replied: number;
};

const STATE: Record<string, { label: string; pill: string }> = {
  active: { label: "مستمر", pill: "crmPill live" },
  stopped: { label: "متوقف", pill: "crmPill alert" },
  completed: { label: "أنهى", pill: "crmPill" },
  removed: { label: "أُزيل", pill: "crmPill" }
};

export default async function CohortPage({
 params }: { params: Promise<{ id: string }> }) {
  await requireUser("journeys.view");

  const journeyId = Number((await params).id);
  const journey = getJourney(journeyId);

  if (!journey) {
    notFound();
  }

  const label = journeyLabel(journeyId);
  const funnel = journeyFunnel(journeyId);
  const steps = stepBreakdown(journeyId);

  const members = getDb()
    .prepare(
      `SELECT m.id AS member_id, m.name, m.phone, e.state, e.stop_reason,
              (SELECT COUNT(*) FROM journey_sends s WHERE s.enrollment_id = e.id AND s.state = 'sent') AS sent,
              (SELECT COUNT(*) FROM journey_sends s JOIN messages msg ON msg.id = s.message_id
                WHERE s.enrollment_id = e.id AND msg.status = 'read') AS read,
              (SELECT COUNT(*) FROM messages msg
                WHERE msg.member_id = m.id AND msg.direction = 'incoming') AS replied
         FROM journey_enrollments e
         JOIN members m ON m.id = e.member_id
        WHERE e.journey_id = ?
        ORDER BY CASE e.state WHEN 'stopped' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, m.name`
    )
    .all(journeyId) as MemberRow[];

  return (
    <div className="crmPage wide">
      <Link className="crmBack" href="/new/paths">
        ← المسارات
      </Link>

      <header className="crmHead">
        <h1>{label.group}</h1>
        <p>
          {label.name} · بدأ {day(`${journey.anchorDate}T00:00:00.000Z`)} · {memberCount(funnel.enrolled)}
        </p>
      </header>

      <section className="crmGrid">
        {[
          { label: "أُرسلت", value: funnel.sent, tone: "salmon" },
          { label: "وصلت", value: funnel.reached, tone: "apricot" },
          { label: "قُرئت", value: funnel.read, tone: "mauve" },
          { label: "ردّوا", value: funnel.replied, tone: "mint" }
        ].map((stat) => (
          <div className="crmCard crmTile crmPad" data-tone={stat.tone} key={stat.label} style={{ flex: "1 1 160px" }}>
            <div className="figure">{stat.value}</div>
            <div className="crmRowDetail">{stat.label}</div>
          </div>
        ))}
      </section>

      <div className="crmSplit">
        <div className="main">
          <section className="crmCard" data-tone="mauve">
            <header>
              <span className="crmDot" />
              <h2>المنتسبين</h2>
              <span className="crmPill tone spacer">{members.length}</span>
            </header>
            {members.length === 0 ? (
              <p className="crmEmpty">ولا وحدة بالمجموعة لهلق.</p>
            ) : (
              members.map((row) => (
                <Link className="crmRow" href={`/new/people/${row.member_id}`} key={row.member_id}>
                  <span className="crmAvatar" data-hue={hueOf(row.name)}>
                    {initials(row.name)}
                  </span>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {row.name}
                    </span>
                    <span className="crmRowDetail" style={{ display: "block" }}>
                      {row.sent} أُرسلت · {row.read} قُرئت · {row.replied} ردّ
                      {row.stop_reason ? ` · ${row.stop_reason}` : ""}
                    </span>
                  </span>
                  <span className={STATE[row.state]?.pill ?? "crmPill"}>{STATE[row.state]?.label ?? row.state}</span>
                </Link>
              ))
            )}
          </section>
        </div>

        <div className="side">
          <section className="crmCard" data-tone="apricot">
            <header>
              <span className="crmDot" />
              <h2>خطوات المسار</h2>
            </header>
            {steps.length === 0 ? (
              <p className="crmEmpty">ولا خطوة.</p>
            ) : (
              steps.map((step) => (
                <div className="crmRow" key={step.stepId}>
                  <span className="grow">
                    <span className="crmRowTitle" style={{ display: "block" }}>
                      {step.label}
                    </span>
                    <span className="crmRowDetail" style={{ display: "block" }}>
                      {day(step.dueAt)} {clock(step.dueAt)} · {step.sentText + step.sentTemplate} أُرسلت ·{" "}
                      {step.read} قُرئت
                      {step.failed ? ` · ${step.failed} فشلت` : ""}
                      {step.stuck ? ` · ${step.stuck} عالقة` : ""}
                    </span>
                  </span>
                </div>
              ))
            )}
          </section>

          {Object.keys(funnel.stopped).length > 0 && (
            <dl className="crmCard crmPad crmFacts">
              {Object.entries(funnel.stopped).map(([reason, count]) => (
                <div key={reason} style={{ display: "contents" }}>
                  <dt>{reason}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="crmCard crmPad">
            <p className="crmNote">
              تشغيل ووقف المسار وتعديل الخطوات لسّه بالواجهة السابقة.
            </p>
            <a className="crmBtn" href="/journeys" style={{ marginTop: 10 }}>
              فتح المسارات
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
