import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "./media-store";

/**
 * The picture at the top of a template.
 *
 * A template with an image header cannot be sent without one: Meta refuses
 * the message with «Parameter format does not match format in the created
 * template» (#132012), which says nothing at all about a missing picture.
 * The image used when the template was approved is the one that belongs
 * there, so it is kept here and attached on every send of that template.
 *
 * On disk rather than in the database: it is a file, the volume is where
 * files live, and a few hundred kilobytes of base64 in a row that is read
 * on every send is a bad trade.
 */
function dir() {
  const at = path.join(getDataDir(), "template-media");
  mkdirSync(at, { recursive: true });
  return at;
}

/** Template names come from Meta; this keeps one off the filesystem. */
function safeName(name: string) {
  return /^[A-Za-z0-9_]{1,80}$/.test(name) ? name : null;
}

export function saveTemplateHeader(name: string, bytes: Uint8Array, mime: string) {
  const safe = safeName(name);
  if (!safe) {
    throw new Error("Unexpected template name.");
  }
  const extension = mime === "image/png" ? "png" : "jpg";
  // One file per template: a second upload replaces the first.
  for (const old of readdirSync(dir())) {
    if (old.startsWith(`${safe}.`)) {
      writeFileSync(path.join(dir(), old), Buffer.alloc(0));
    }
  }
  writeFileSync(path.join(dir(), `${safe}.${extension}`), bytes);
  return `${safe}.${extension}`;
}

export function templateHeaderFile(name: string) {
  const safe = safeName(name);
  if (!safe) {
    return null;
  }
  for (const extension of ["jpg", "png"]) {
    const at = path.join(dir(), `${safe}.${extension}`);
    if (existsSync(at) && readFileSync(at).byteLength > 0) {
      return { path: at, mime: extension === "png" ? "image/png" : "image/jpeg" };
    }
  }
  return null;
}

/**
 * The address Meta will fetch it from — absolute, because Meta is doing
 * the fetching and a relative path means nothing to it.
 */
export function templateHeaderUrl(name: string) {
  const base = process.env.PUBLIC_BASE_URL || "https://www.afkarheartbeat.com";
  return templateHeaderFile(name) ? `${base.replace(/\/$/, "")}/api/t/${name}/header` : null;
}
