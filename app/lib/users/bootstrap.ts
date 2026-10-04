import { createUser, countUsers, normalizeUsername } from "./store";

/**
 * The shared login becomes the first owner.
 *
 * It ran this system alone until now, so it is the one account that is
 * certain to be in the right hands. Turning it into a row rather than
 * leaving it as a second way in means there is one door to guard, and the
 * first thing that owner is asked for is a password of their own.
 */
export function bootstrapOwner(username: string, password: string) {
  if (countUsers() > 0) {
    return null;
  }

  const envUser = process.env.Admin_User || process.env.ADMIN_USER || "";
  const envPass = process.env.Admin_Pass || process.env.ADMIN_PASS || "";

  if (!envUser || !envPass) {
    return null;
  }

  if (normalizeUsername(username) !== normalizeUsername(envUser) || password !== envPass) {
    return null;
  }

  const created = createUser({
    name: envUser,
    username: envUser,
    password,
    role: "owner",
    mustChangePassword: true
  });

  return created.ok ? created.user : null;
}
