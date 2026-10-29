import { deleteMember, getMember, normalizePhone } from "../db";
import { deletePersonFile, listPersonFiles } from "../person-files";

/**
 * Deleting a contact, with the files on disk.
 *
 * `deleteMember` works in the database and cannot reach the file store
 * without importing it, which imports the database back. So the files are
 * removed from here, around it.
 *
 * The phone is checked here first, before anything is touched. `deleteMember`
 * checks it too, but by then the files would already be gone — and a number
 * that does not match must leave the contact exactly as she was.
 */
export function eraseMember(memberId: number, confirmPhone: string) {
  const member = getMember(memberId);
  if (!member) {
    return { ok: false as const, error: "هذا المنتسب غير موجود." };
  }

  if (!confirmPhone || normalizePhone(confirmPhone) !== member.phone) {
    return { ok: false as const, error: "الرقم ما بيطابق رقم هذا المنتسب." };
  }

  // Row and bytes together, before the record that names them. The other way
  // round leaves her files on disk with nothing pointing at them — the one
  // outcome a delete must not produce.
  const files = listPersonFiles(memberId);
  for (const file of files) {
    deletePersonFile(file.id);
  }

  const result = deleteMember(memberId, confirmPhone);
  if (!result.ok) {
    return result;
  }

  return { ...result, files: files.length };
}
