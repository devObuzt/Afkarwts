import { NextResponse } from "next/server";
import { listForms, listSubmissions } from "@/app/lib/forms/store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const formId = Number(params.get("formId")) || undefined;
  const state = params.get("state") || undefined;

  return NextResponse.json({ leads: listSubmissions({ formId, state }), forms: listForms() });
}
