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
