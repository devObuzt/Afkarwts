import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { gridToCsv, searchRows, submissionGrid } from "@/app/lib/forms/report";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The same two the page asks for: the file is the page, downloaded.
  // Guarding it by the medical permission alone let anyone holding that
  // take a whole cohort's table without being able to open the screen.
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
  const state = incoming.get("state") ?? "";
  const grid = submissionGrid(formId, { state: state || undefined });

  if (!grid) {
    return NextResponse.json({ error: "النموذج غير موجود." }, { status: 404 });
  }

  // The file is the page, downloaded — so a search narrows it the same way.
  grid.rows = searchRows(grid.rows, incoming.get("q") ?? "");

  // A Latin, dateless name: Arabic in a Content-Disposition is a per-browser
  // guess, and a file called «تسجيل.csv» has arrived mangled before.
  const name = `registrations-${formId}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(gridToCsv(grid), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store"
    }
  });
}
