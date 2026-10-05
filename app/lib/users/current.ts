import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { can, type Permission } from "./permissions";
import { SESSION_COOKIE, readSession } from "./session";
import { getUser, touchUser, type User } from "./store";

/**
 * Who is asking, read from the database rather than from the cookie.
 *
 * The cookie only proves which account signed in. Whether that account is
 * still switched on, and what it is still allowed to do, is read here — so
 * taking a permission away takes effect on the next click, not on the next
 * login.
 */
export async function currentUser(): Promise<User | null> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return null;
  }

  const user = getUser(session.userId);
  if (!user || !user.active) {
    return null;
  }

  return user;
}

/** For a page: no session sends you to the login, no permission sends you home. */
export async function requireUser(permission?: Permission) {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  // A temporary password handed out by whoever created the account is not
  // a password: it is known to two people. Nothing else opens until it is
  // replaced.
  if (user.mustChangePassword) {
    redirect("/password");
  }

  if (permission && !can(user, permission)) {
    redirect("/new?denied=" + encodeURIComponent(permission));
  }

  touchUser(user.id);
  return user;
}

/** For an API route: the same two answers, as status codes. */
export async function requireApi(permission?: Permission) {
  const user = await currentUser();

  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "تسجيل الدخول مطلوب." }, { status: 401 }) };
  }

  if (permission && !can(user, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "لا تملك صلاحية لهذه العملية." }, { status: 403 })
    };
  }

  return { ok: true as const, user };
}
