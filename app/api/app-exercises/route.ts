import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appAdmin, appConfig } from "@/app/lib/afkar-app/client";
import { canHandleProducts } from "@/app/lib/afkar-app/queues";
import type { AppExercise } from "@/app/lib/afkar-app/training";

export const runtime = "nodejs";
const CATEGORIES = ["strength", "cardio", "mobility", "other"];

/** Adds to Afkar's exercise library — her own team only (the app refuses a coach too). */
export async function POST(request: Request) {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return auth.response;
  if (!appConfig()) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 });
  if (!canHandleProducts(auth.user.role)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const b = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const howto = typeof b.howto === "string" ? b.howto.trim().slice(0, 1000) : "";
  if (!name || name.length > 120 || !CATEGORIES.includes(String(b.category)) || (b.unit !== "reps" && b.unit !== "minutes")) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const made = await appAdmin<AppExercise>(auth.user, "/admin/v1/exercises", { method: "POST", body: { name: { ar: name }, category: b.category, unit: b.unit, howto } });
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status === 400 ? 400 : 502 });
  return NextResponse.json(made.data, { status: 201 });
}
