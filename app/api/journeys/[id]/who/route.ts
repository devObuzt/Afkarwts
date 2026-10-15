import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { can } from "@/app/lib/users/permissions";
import { whoOnStep } from "@/app/lib/journeys/report";

export const runtime = "nodejs";

/**
 * The names behind one number on the journey report.
 *
 * Two permissions, not one: seeing a cohort's funnel is not the same as
 * being handed every woman's name and phone in it, and «journeys.view» is
 * in the coach preset. And the rows follow the same rule the people list
 * does — without «people.all» you see the women assigned to you.
 *
 * What she wrote back is left out unless the caller may read the inbox.
 * A reply is a conversation, not a statistic.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApi("journeys.view");
  if (!auth.ok) {
    return auth.response;
  }

  if (!can(auth.user, "people.view")) {
    return NextResponse.json({ error: "هذه القائمة تحوي أسماء المنتسبات وأرقامهن." }, { status: 403 });
  }

  const url = new URL(request.url);
  const stepParam = url.searchParams.get("step");
  const rows = whoOnStep(Number((await params).id), stepParam ? Number(stepParam) : null, url.searchParams.get("bucket") ?? "", {
    onlyAssignedTo: can(auth.user, "people.all") ? null : auth.user.id,
    withReplyText: can(auth.user, "messages.send")
  });

  return NextResponse.json({ rows });
}
