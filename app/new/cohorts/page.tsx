import { permanentRedirect } from "next/navigation";

/** The area was called «cohorts» before Wisam corrected the word: these are
 *  مسارات, not دورات. Any link already handed out still lands in the right
 *  place. */
export default function MovedPage() {
  permanentRedirect("/new/paths");
}
