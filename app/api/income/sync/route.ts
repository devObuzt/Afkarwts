import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { recordAction } from "@/app/lib/users/audit";
import { syncIncome } from "@/app/lib/income/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApi("income.view");
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
  const from = String(body.from ?? "").slice(0, 10);
  const to = String(body.to ?? "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "التواريخ غير صالحة." }, { status: 400 });
  }

  const result = await syncIncome(from, to);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  recordAction({
    userId: auth.user.id,
    actor: auth.user.name,
    action: "income.sync",
    detail: `${from} → ${to} · ${result.written} فاتورة`
  });

  return NextResponse.json(result);
}
