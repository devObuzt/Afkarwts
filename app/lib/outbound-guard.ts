import { randomUUID } from "node:crypto";

/**
 * Outbound traffic is live only inside the production Railway project. Staging,
 * local development and any copy of the production database are dry by default,
 * so a forgotten variable can never reach a real contact.
 */
export function isLive() {
  return process.env.RAILWAY_PROJECT_NAME === "Afkarwts" && process.env.DRY_RUN !== "1";
}

export function dryRunId(prefix = "dryrun") {
  return `${prefix}.${randomUUID()}`;
}
