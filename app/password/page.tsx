import { redirect } from "next/navigation";
import { currentUser } from "@/app/lib/users/current";
import "../new/crm.css";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="crm" data-area="users" dir="rtl" lang="ar">
      <div className="crmBody">
        <div className="crmPage" style={{ maxWidth: 480 }}>
          <header className="crmHead">
            <h1>كلمة السر</h1>
            <p>
              {user.mustChangePassword
                ? "هاي كلمة سر مؤقتة — معروفة لأكتر من واحد. حطّي وحدة من عندك قبل ما تكمّلي."
                : "غيّري كلمة سرّك."}
            </p>
          </header>
          <PasswordForm mustChange={user.mustChangePassword} />
        </div>
      </div>
    </div>
  );
}
