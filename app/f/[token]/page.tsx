import type { Metadata } from "next";
import { getFormByToken, listFields } from "@/app/lib/forms/store";
import { FormClient } from "./FormClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const form = getFormByToken((await params).token);
  return {
    title: form ? form.name : "استمارة التسجيل",
    // A registration link is shared person to person, not indexed.
    robots: { index: false, follow: false }
  };
}

export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const form = getFormByToken(token);

  if (!form) {
    return (
      <main className="formPage" dir="rtl" lang="ar">
        <section className="formCard">
          <h1>الرابط غير موجود</h1>
          <p className="formNote">تأكد من الرابط اللي وصلك، أو تواصل معنا على الواتساب.</p>
        </section>
      </main>
    );
  }

  if (form.status !== "open") {
    return (
      <main className="formPage" dir="rtl" lang="ar">
        <section className="formCard">
          <h1>{form.name}</h1>
          <p className="formNote">انتهى التسجيل عبر هذا الرابط. تواصل معنا على الواتساب لأي استفسار.</p>
        </section>
      </main>
    );
  }

  return <FormClient fields={listFields(form.id)} intro={form.intro} name={form.name} token={token} />;
}
