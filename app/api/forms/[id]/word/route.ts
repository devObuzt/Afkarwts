import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { searchRows, submissionGrid } from "@/app/lib/forms/report";
import { KITS, isKitKey, kitDocx } from "@/app/lib/forms/kits";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The same two gates the Excel export has. The delivery list carries no
  // medical column, but it still carries a whole cohort's names, towns and
  // phones — so it is not a cheaper file to take.
  const seesCohort = await requireApi("journeys.view");
  if (!seesCohort.ok) {
    return seesCohort.response;
  }

  const auth = await requireApi("people.health");
  if (!auth.ok) {
    return auth.response;
  }

  const formId = Number((await params).id);
  const incoming = new URL(request.url).searchParams;
  const kit = incoming.get("kit") ?? "";

  if (!isKitKey(kit)) {
    return NextResponse.json({ error: "تقرير غير معروف." }, { status: 400 });
  }

  const state = incoming.get("state") ?? "";
  const grid = submissionGrid(formId, { state: state || undefined });

  if (!grid) {
    return NextResponse.json({ error: "النموذج غير موجود." }, { status: 404 });
  }

  grid.rows = searchRows(grid.rows, incoming.get("q") ?? "");

  const file = `${KITS[kit].file}-${formId}-${new Date().toISOString().slice(0, 10)}.docx`;

  return new Response(new Uint8Array(kitDocx(grid, kit)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store"
    }
  });
}
