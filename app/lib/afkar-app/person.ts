import { getDb } from "@/app/lib/db";
import { can } from "@/app/lib/users/permissions";
import { appAdmin, type AppResult } from "./client";

type Staff = { id: number; name: string; role: string };

/** The app stores names per language ({ar, he}); HeartBeat reads Arabic, and any name beats none. */
export function localName(name: unknown): string {
  if (typeof name === "string") return name;
  if (!name || typeof name !== "object") return "";
  const byLang = name as Record<string, unknown>;
  const pick = byLang.ar ?? Object.values(byLang).find((v) => typeof v === "string");
  return typeof pick === "string" ? pick : "";
}

export type AppMember = {
  id: string;
  display_name: string;
  phone_e164: string | null;
  first_login_at: string | null;
};
export type AppPlan = { id: string; program_key: string; name: string; starts_on: string; length_days: number; status: string };
export type AppProgram = { id: string; key: string; name: string; length_days: number; owner: string };

/** The app's view of one HeartBeat person: her account there (if any) and her plans. */
export async function appPersonView(user: Staff, personId: number): Promise<AppResult<{ member: AppMember | null; plans: AppPlan[] }>> {
  const found = await appAdmin<{ members: AppMember[] }>(user, `/admin/v1/members?afkarwts_person_id=${personId}`);
  if (!found.ok) return found;
  const member = found.data.members[0] ?? null;
  if (!member) return { ok: true, data: { member: null, plans: [] } };
  const plans = await appAdmin<{ plans: AppPlan[] }>(user, `/admin/v1/members/${member.id}/plan`);
  if (!plans.ok) return plans;
  return { ok: true, data: { member, plans: plans.data.plans.map((plan) => ({ ...plan, name: localName(plan.name) })) } };
}

export async function appPrograms(user: Staff): Promise<AppResult<AppProgram[]>> {
  const result = await appAdmin<{ programs: AppProgram[] }>(user, "/admin/v1/programs");
  return result.ok
    ? { ok: true, data: result.data.programs.map((program) => ({ ...program, name: localName(program.name) })) }
    : result;
}

/**
 * The same rule /new/people applies: without people.all you see only the people
 * assigned to you. An app account not tied to a HeartBeat person is hidden too.
 */
export function visibleAppMembers<M extends { afkarwts_person_id: string | null }>(
  members: M[],
  viewer: { id: number; seesAll: boolean }
): M[] {
  if (viewer.seesAll) return members;
  const rows = getDb().prepare("SELECT id FROM members WHERE assigned_user_id = ?").all(viewer.id) as Array<{ id: number }>;
  const mine = new Set(rows.map((row) => String(row.id)));
  return members.filter((member) => member.afkarwts_person_id !== null && mine.has(member.afkarwts_person_id));
}

/**
 * Whether this user may act on one person's app account. A login link opens her
 * account, so it follows the people.all rule rather than the looser person page.
 */
export function canActOnPerson(user: { id: number; role: string; permissions: string[] }, personId: number): boolean {
  if (can(user, "people.all")) return true;
  const row = getDb().prepare("SELECT assigned_user_id AS owner FROM members WHERE id = ?").get(personId) as
    | { owner: number | null }
    | undefined;
  return row?.owner === user.id;
}
