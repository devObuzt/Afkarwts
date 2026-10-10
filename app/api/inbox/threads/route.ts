import { requireApi } from "@/app/lib/users/current";
import { NextResponse } from "next/server";
import { listThreads } from "@/app/lib/inbox";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApi("people.view");
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  return NextResponse.json(
    listThreads({ query: url.searchParams.get("q") ?? "", limit: Number(url.searchParams.get("limit")) || 40 })
  );
}
