import { NextResponse } from "next/server";
import { requireApi } from "@/app/lib/users/current";
import { appConfig, type AppResult } from "./client";
import { canHandleProducts } from "./queues";

/** Afkar's libraries are written by her own team only (the app refuses a coach too). */
export async function libraryWriter() {
  const auth = await requireApi("people.edit");
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!appConfig()) return { ok: false as const, response: NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 }) };
  if (!canHandleProducts(auth.user.role)) return { ok: false as const, response: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }) };
  return { ok: true as const, user: auth.user };
}

export async function libraryReader() {
  const auth = await requireApi("people.view");
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!appConfig()) return { ok: false as const, response: NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 409 }) };
  return { ok: true as const, user: auth.user };
}

/** The app's answer as-is; the app's refusals keep their code, and a dead app reads as one. */
export function relay<T>(result: AppResult<T>) {
  if (result.ok) return NextResponse.json(result.data);
  const known = [400, 403, 404, 409, 422].includes(result.status);
  return NextResponse.json({ error: known ? result.error : "UNREACHABLE" }, { status: known ? result.status : 502 });
}

export const refuse = (error: string, row?: number) => NextResponse.json({ error, ...(row === undefined ? {} : { row }) }, { status: 400 });
export const UUID = /^[0-9a-f-]{36}$/;
