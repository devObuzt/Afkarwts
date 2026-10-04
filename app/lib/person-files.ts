import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { formatBytes, getDataDir } from "./media-store";
import { type PersonFile, type PersonFileKind } from "./person-file-kinds";

export { FILE_KINDS, KIND_LABEL, type PersonFile, type PersonFileKind } from "./person-file-kinds";

/**
 * The files Afkar hands a member: the meal plan she wrote for her, a blood
 * test she was sent, a before photo. They are not WhatsApp media — they are
 * not tied to a message at all, and most of them are written months before
 * they are sent, or never sent through here. So they hang off the person.
 */

export const MAX_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_FILE_LABEL = "32 MB";

function getFilesDir() {
  const dir = path.join(getDataDir(), "files");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * A stored name is ours, not the uploader's: random stem, extension taken
 * from the original name but stripped to letters and digits. An uploaded name
 * never reaches the filesystem, so «../../etc/passwd» cannot escape.
 */
function storedName(originalName: string) {
  const extension = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
  return `${Date.now().toString(36)}${randomBytes(6).toString("hex")}${extension || ".bin"}`;
}

export function safeStoredName(filename: string) {
  return path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function mapFile(row: Record<string, string | number>): PersonFile {
  const sizeBytes = Number(row.size_bytes);
  return {
    id: Number(row.id),
    memberId: Number(row.member_id),
    kind: String(row.kind) as PersonFileKind,
    label: String(row.label),
    filename: String(row.filename),
    originalName: String(row.original_name),
    mimeType: String(row.mime_type),
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    note: String(row.note ?? ""),
    uploadedAt: String(row.uploaded_at),
    url: `/api/files/${String(row.filename)}`
  };
}

const COLUMNS = "id, member_id, kind, label, filename, original_name, mime_type, size_bytes, note, uploaded_at";

export function savePersonFile(input: {
  memberId: number;
  kind: PersonFileKind;
  label: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
  note?: string;
}) {
  const filename = storedName(input.originalName);
  writeFileSync(path.join(getFilesDir(), filename), input.bytes);

  const label = input.label.trim() || input.originalName.trim() || filename;
  const row = getDb()
    .prepare(
      `INSERT INTO person_files (member_id, kind, label, filename, original_name, mime_type, size_bytes, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING ${COLUMNS}`
    )
    .get(
      input.memberId,
      input.kind,
      label,
      filename,
      input.originalName,
      input.mimeType,
      input.bytes.byteLength,
      input.note ?? ""
    ) as Record<string, string | number>;

  return mapFile(row);
}

export function listPersonFiles(memberId: number): PersonFile[] {
  return (
    getDb()
      .prepare(`SELECT ${COLUMNS} FROM person_files WHERE member_id = ? ORDER BY uploaded_at DESC, id DESC`)
      .all(memberId) as Array<Record<string, string | number>>
  ).map(mapFile);
}

export function getPersonFile(id: number) {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM person_files WHERE id = ?`).get(id) as
    | Record<string, string | number>
    | undefined;
  return row ? mapFile(row) : null;
}

export function findPersonFileByName(filename: string) {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM person_files WHERE filename = ?`).get(safeStoredName(filename)) as
    | Record<string, string | number>
    | undefined;
  return row ? mapFile(row) : null;
}

export function renamePersonFile(id: number, label: string, note: string) {
  const trimmed = label.trim();
  if (!trimmed) {
    return false;
  }
  const result = getDb().prepare("UPDATE person_files SET label = ?, note = ? WHERE id = ?").run(trimmed, note, id);
  return Number(result.changes) > 0;
}

/** Row and bytes together: a listed file that 404s is worse than no file. */
export function deletePersonFile(id: number) {
  const file = getPersonFile(id);
  if (!file) {
    return false;
  }

  getDb().prepare("DELETE FROM person_files WHERE id = ?").run(id);
  rmSync(path.join(getFilesDir(), safeStoredName(file.filename)), { force: true });
  return true;
}

export function readPersonFileBytes(filename: string) {
  return readFileSync(path.join(getFilesDir(), safeStoredName(filename)));
}
