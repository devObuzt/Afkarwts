import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * `app/lib/db.ts` opens one SQLite connection per process and keeps it on a
 * global, so a test file gets its own database by pointing APP_DATA_DIR at a
 * fresh directory before the module is imported. The test runner gives each
 * file its own process, so one call per file is enough.
 */
export function useTempDataDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "afkar-test-"));
  process.env.APP_DATA_DIR = dir;
  return dir;
}
