import { appRoleOf } from "./client";

/**
 * Afkar's two queues from the member app: photos a member sent with «ابعثيها لأفكار»,
 * and products she scanned that aren't in the library yet. These helpers are the
 * rules; the pages and routes only move data.
 */

export type AppReview = {
  id: string;
  note: string;
  status: string;
  at: string;
  member: { id: string; display_name: string; phone_e164: string | null };
};
export type AppProductRequest = {
  id: string;
  barcode: string;
  source: "openfoodfacts" | "label_ocr";
  name: string;
  per100: { kcal: number; protein: number; carb: number; fat: number };
  at: string;
};

/** Adding to Afkar's library is her own team's job — the app refuses a coach anyway (403). */
export function canHandleProducts(role: string): boolean {
  return appRoleOf(role) !== "coach";
}

export type ResolvePayload = { outcome: "added" | "not_added"; message?: string };

/** What she's told follows the outcome; a blank message means the app's default wording. */
export function resolvePayload(input: { outcome?: unknown; message?: unknown }): ResolvePayload | null {
  if (input.outcome !== "added" && input.outcome !== "not_added") return null;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > 300) return null;
  return message ? { outcome: input.outcome, message } : { outcome: input.outcome };
}

type ApproveForm = {
  name?: unknown;
  kcal?: unknown;
  protein?: unknown;
  carb?: unknown;
  fat?: unknown;
  portionLabel?: unknown;
  portionGrams?: unknown;
};
export type ApproveBody = {
  name: { ar: string };
  per100: { kcal: number; protein: number; carb: number; fat: number };
  portions: Array<{ label: { ar: string }; grams: number }>;
};

const num = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? Number(value) : typeof value === "number" ? value : NaN);
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Afkar checks what the AI or Open Food Facts read before it reaches every member:
 * the numbers must be possible for 100g of food, and a home portion needs both a
 * name and a weight (without one, members log it by grams).
 */
export function approvePayload(form: ApproveForm): { ok: true; body: ApproveBody } | { ok: false; error: "NAME" | "VALUES" | "PORTION" } {
  const name = text(form.name);
  if (!name || name.length > 120) return { ok: false, error: "NAME" };

  const per100 = { kcal: num(form.kcal), protein: num(form.protein), carb: num(form.carb), fat: num(form.fat) };
  const values = Object.values(per100);
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return { ok: false, error: "VALUES" };
  if (per100.kcal > 900 || per100.protein + per100.carb + per100.fat > 100) return { ok: false, error: "VALUES" };

  const label = text(form.portionLabel);
  const gramsRaw = text(form.portionGrams);
  if (!label && !gramsRaw) return { ok: true, body: { name: { ar: name }, per100, portions: [] } };
  const grams = Number(gramsRaw);
  if (!label || !Number.isFinite(grams) || grams <= 0 || grams > 2000) return { ok: false, error: "PORTION" };
  return { ok: true, body: { name: { ar: name }, per100, portions: [{ label: { ar: label }, grams }] } };
}

/** Only photos from members this user may see — the same list /new/app shows — each tied to her HeartBeat page. */
export function visibleReviews<R extends AppReview>(
  reviews: R[],
  visibleMembers: Array<{ id: string; afkarwts_person_id: string | null }>
): Array<R & { personId: string | null }> {
  const byId = new Map(visibleMembers.map((member) => [member.id, member.afkarwts_person_id]));
  return reviews.filter((review) => byId.has(review.member.id)).map((review) => ({ ...review, personId: byId.get(review.member.id) ?? null }));
}

// ---- server side: what this user may see, fetched as her ----
export async function loadQueues(user: { id: number; name: string; role: string; permissions: string[] }) {
  const { appAdmin } = await import("./client");
  const { visibleAppMembers } = await import("./person");
  const { can } = await import("@/app/lib/users/permissions");
  const products = canHandleProducts(user.role);
  const [members, reviews, requests] = await Promise.all([
    appAdmin<{ members: Array<{ id: string; afkarwts_person_id: string | null }> }>(user, "/admin/v1/members"),
    appAdmin<{ items: AppReview[] }>(user, "/admin/v1/review-requests"),
    products ? appAdmin<{ items: AppProductRequest[] }>(user, "/admin/v1/product-requests") : Promise.resolve(null)
  ]);
  const visible = members.ok ? visibleAppMembers(members.data.members, { id: user.id, seesAll: can(user, "people.all") }) : [];
  return {
    ok: members.ok && reviews.ok && (requests === null || requests.ok),
    reviews: members.ok && reviews.ok ? visibleReviews(reviews.data.items, visible) : [],
    products: requests && requests.ok ? requests.data.items : null
  };
}
