import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { getForm } from "@/app/lib/forms/store";
import { findBrowser, renderPdf } from "@/app/lib/pdf/render";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const seesCohort = await requireApi("journeys.view");
  if (!seesCohort.ok) {
    return seesCohort.response;
  }

  const auth = await requireApi("people.health");
  if (!auth.ok) {
    return auth.response;
  }

  const formId = Number((await params).id);
  const form = getForm(formId);

  if (!form) {
    return NextResponse.json({ error: "النموذج غير موجود." }, { status: 404 });
  }

  if (!findBrowser()) {
    return NextResponse.json(
      { error: "توليد PDF غير متاح على هذه الخدمة. استعمل «نسخة للطباعة» واحفظها PDF من المتصفّح." },
      { status: 503 }
    );
  }

  const incoming = new URL(request.url);
  const state = incoming.searchParams.get("state") ?? "";
  const search = incoming.searchParams.get("q") ?? "";

  // Rendered against the service's own address: the public hostname may sit
  // behind a proxy the container cannot reach back through.
  const origin = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const target =
    `${origin}/new/forms/${formId}/report?print=1` +
    (state ? `&state=${encodeURIComponent(state)}` : "") +
    (search ? `&q=${encodeURIComponent(search)}` : "");

  try {
    const pdf = await renderPdf({ url: target, cookies: request.headers.get("cookie") ?? "" });
    const name = `registrations-${formId}-${new Date().toISOString().slice(0, 10)}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذّر توليد الملف." },
      { status: 502 }
    );
  }
}
