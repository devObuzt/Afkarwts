import { campaignProgress, campaignSendBody } from "./campaigns";
import { getDb, listCampaigns, type Campaign } from "./db";
import { sendTelegramMessage } from "./telegram";
import { classifyFailure } from "./whatsapp-errors";

/**
 * تقرير الحملة على تلجرام — بلا ما يفتح حدا الشاشة.
 *
 * 🔑 **ليش:** صفحة الحملة بتعرض كل إشي (تشغيلات · فاشلة مجمّعة بالسبب ·
 * منتظرة) — بس لازم حدا يفتحها. حملة على آلاف الأرقام بتمشي ساعات،
 * والسؤال «هل عملنا اللي علينا» بينسأل وقت ما تكون الشاشة مسكّرة.
 *
 * 🔑 **وبيبعت بس لما يتغيّر رقم.** تقرير كل نصف ساعة بيقول نفس الشي
 * بيصير ضجيج، والضجيج بيخلّي الواحد يوقف يقرا — فبتضيع معه التقارير
 * اللي بتعني إشي. العلامة محفوظة بالقاعدة فبتعيش بعد إعادة النشر.
 */

export type CampaignReport = {
  id: number;
  label: string;
  total: number;
  delivered: number;
  remaining: number;
  failed: number;
  reasons: Array<{ title: string; count: number; action: string | null }>;
};

function mark(report: CampaignReport) {
  return `${report.delivered}/${report.total}·${report.failed}`;
}

function lastMark(campaignId: number): string | null {
  const row = getDb()
    .prepare("SELECT value FROM app_state WHERE key = ?")
    .get(`campaign.report.${campaignId}`) as { value: string } | undefined;
  return row?.value ?? null;
}

function remember(campaignId: number, value: string) {
  getDb()
    .prepare(
      "INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
    )
    .run(`campaign.report.${campaignId}`, value);
}

/**
 * الفشل بينقرا من الرسائل نفسها: الحملة بتخزّن نص الإرسال، والرسائل
 * الفاشلة اللي بنفس النص هي فشل هاي الحملة — نفس المفتاح اللي بتقارن
 * عليه الحملة أصلاً.
 */
export function reportFor(campaign: Campaign): CampaignReport {
  const progress = campaignProgress(campaign);
  const failures = getDb()
    .prepare(
      `SELECT error FROM messages
        WHERE direction = 'outgoing' AND status = 'failed'
          AND COALESCE(send_key, body) = ?`
    )
    .all(campaignSendBody(campaign)) as Array<{ error: string | null }>;

  const grouped = new Map<string, { title: string; count: number; action: string | null }>();
  for (const row of failures) {
    const reason = classifyFailure(row.error ?? "");
    const current = grouped.get(reason.kind) ?? { title: reason.title, count: 0, action: reason.action };
    current.count += 1;
    grouped.set(reason.kind, current);
  }

  return {
    id: campaign.id,
    label: campaign.label,
    total: progress.total,
    delivered: progress.delivered,
    remaining: progress.remaining,
    failed: failures.length,
    reasons: [...grouped.values()].sort((a, b) => b.count - a.count)
  };
}

export function formatReport(report: CampaignReport) {
  const lines = [
    `📣 حملة «${report.label}»`,
    `انبعت: ${report.delivered} من ${report.total}`,
    report.remaining > 0 ? `باقي: ${report.remaining}` : "خلصت ✅"
  ];
  if (report.failed > 0) {
    lines.push(`فشل: ${report.failed}`);
    for (const reason of report.reasons) {
      lines.push(`  · ${reason.title}: ${reason.count}${reason.action ? ` — ${reason.action}` : ""}`);
    }
  }
  return lines.join("\n");
}

/** بتفحص كل حملة شغّالة وبتبعت اللي تغيّر. بترجّع شو انبعت. */
export async function reportActiveCampaigns() {
  const campaigns = listCampaigns({ limit: 200 }).filter((item) => item.status === "active");
  const sent: CampaignReport[] = [];

  for (const campaign of campaigns) {
    const report = reportFor(campaign);
    const now = mark(report);
    if (lastMark(campaign.id) === now) {
      continue;
    }
    remember(campaign.id, now);
    sent.push(report);
    await sendTelegramMessage(formatReport(report)).catch((error) =>
      console.error("Campaign report failed:", error)
    );
  }

  return sent;
}
