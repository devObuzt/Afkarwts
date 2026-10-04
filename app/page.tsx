import { InboxClient } from "./InboxClient";
import { requireUser } from "./lib/users/current";

/**
 * The inbox, behind a permission. It used to be the whole system and
 * everyone who could log in could read every conversation — now the page
 * itself asks, on the server, before a line of it is sent.
 */
export default async function Home() {
  await requireUser("people.view");
  return <InboxClient />;
}
