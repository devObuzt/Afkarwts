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
