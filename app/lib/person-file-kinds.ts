/**
 * Kinds and their Arabic labels, kept apart from the store: the uploader runs
 * in the browser, and the store imports node:fs and node:sqlite.
 */

export const FILE_KINDS = ["plan", "test", "photo", "doc", "other"] as const;
export type PersonFileKind = (typeof FILE_KINDS)[number];

export const KIND_LABEL: Record<PersonFileKind, string> = {
  plan: "متكون",
  test: "فحوصات",
  photo: "صور",
  doc: "مستند",
  other: "غير ذلك"
};

export type PersonFile = {
  id: number;
  memberId: number;
  kind: PersonFileKind;
  label: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sizeLabel: string;
  note: string;
  uploadedAt: string;
  url: string;
};

/**
 * The only types served inline. Anything else downloads instead, as bytes
 * with no type of its own: the stored type comes from whoever uploaded the
 * file, and an .html served inline would run on this app's own origin,
 * beside the session cookie. A meal plan is a PDF and a before photo is a
 * JPEG, so the allowlist costs nothing.
 */
export const INLINE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic"
]);

export function isInlineType(mimeType: string) {
  return INLINE_TYPES.has(mimeType.split(";")[0].trim().toLowerCase());
}
