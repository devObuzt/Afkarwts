import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Afkar — Eat. Love. Fit",
  description: "Privacy policy and data deletion instructions for Afkar (Eat. Love. Fit) WhatsApp communication services."
};

const CONTACT_EMAIL = "support@eat-love-fit.com";

export default function PrivacyPage() {
  return (
    <main className="legalShell">
      <article className="legalPanel">
        <header className="legalHeader">
          <img alt="Afkar" className="brandMark" src="/afkar-logo.png" />
          <div>
            <h1>Privacy Policy</h1>
            <p>Afkar — Eat. Love. Fit · Effective date: August 2, 2026</p>
          </div>
        </header>

        <section>
          <h2>1. Who we are</h2>
          <p>
            Afkar (&quot;Eat. Love. Fit&quot;, &quot;we&quot;, &quot;us&quot;) provides nutrition and healthy-lifestyle
            programs. We communicate with our members over WhatsApp using the WhatsApp Business
            Platform (Cloud API) provided by Meta Platforms, Inc. This policy explains what
            information we collect through this service, how we use it, and the choices you have.
            For any question about this policy, contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <section>
          <h2>2. Information we collect</h2>
          <ul>
            <li>
              <strong>Contact details</strong> — your phone number and the profile name associated
              with your WhatsApp account.
            </li>
            <li>
              <strong>Messages</strong> — the content of messages you exchange with our team over
              WhatsApp, including text, images, videos, and documents you choose to send us.
            </li>
            <li>
              <strong>Delivery metadata</strong> — technical information about messages (for
              example sent, delivered, and read status) provided by the WhatsApp Business Platform.
            </li>
          </ul>
          <p>
            We do not collect payment card details, government identifiers, or precise location
            data through this service.
          </p>
        </section>

        <section>
          <h2>3. How we use your information</h2>
          <ul>
            <li>To respond to your questions and support requests.</li>
            <li>To provide, personalize, and follow up on the programs you enrolled in.</li>
            <li>To send you service messages you have agreed to receive over WhatsApp.</li>
            <li>To maintain the security and proper operation of our systems.</li>
          </ul>
          <p>
            We do not sell your personal information, and we do not use it for third-party
            advertising.
          </p>
        </section>

        <section>
          <h2>4. WhatsApp and Meta</h2>
          <p>
            Messages exchanged with us over WhatsApp are transmitted through the WhatsApp Business
            Platform operated by Meta. Meta processes this data as described in the{" "}
            <a href="https://www.whatsapp.com/legal/privacy-policy" rel="noopener noreferrer" target="_blank">
              WhatsApp Privacy Policy
            </a>
            . Your use of WhatsApp itself is governed by your agreement with WhatsApp.
          </p>
        </section>

        <section>
          <h2>5. Storage, sharing, and retention</h2>
          <p>
            Conversation data is stored on our secured servers and is accessible only to authorized
            Afkar team members who need it to serve you. We do not share your personal information
            with third parties except for the service providers that host and operate our
            infrastructure, or where the law requires us to. We keep conversation history only for
            as long as needed to provide our services, after which it is deleted.
          </p>
        </section>

        <section id="data-deletion">
          <h2>6. Your rights and data deletion</h2>
          <p>
            You may at any time ask us to access, correct, or delete the personal data we hold
            about you. To request deletion:
          </p>
          <ul>
            <li>
              Send an email to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from any
              address, mentioning the WhatsApp phone number you contacted us with; or
            </li>
            <li>Send us a WhatsApp message asking for your data to be deleted.</li>
          </ul>
          <p>
            We will confirm the request and delete your contact details, conversation history, and
            any media you sent us within 30 days, unless we are legally required to keep specific
            records. Deleting your data on our side does not affect copies stored in your own
            WhatsApp application.
          </p>
        </section>

        <section>
          <h2>7. Children</h2>
          <p>
            Our WhatsApp service is intended for adults. We do not knowingly collect personal
            information from children under 16. If you believe a child provided us personal
            information, contact us and we will delete it.
          </p>
        </section>

        <section>
          <h2>8. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. The latest version will always be
            available on this page with its effective date.
          </p>
        </section>

        <hr className="legalDivider" />

        <div dir="rtl" lang="ar" className="legalArabic">
          <h2>سياسة الخصوصية (ملخص بالعربية)</h2>
          <p>
            «أفكار — Eat. Love. Fit» بتتواصل مع أعضائها عبر واتسآب من خلال منصة WhatsApp Business
            التابعة لشركة Meta. من خلال هذه الخدمة بنجمع: رقم هاتفك واسم ملفك الشخصي على واتسآب،
            ومحتوى الرسائل والوسائط التي ترسلها لنا، وحالة تسليم الرسائل.
          </p>
          <p>
            بنستخدم هذه المعلومات فقط للرد على استفساراتك ومتابعة البرامج المسجّل فيها وإرسال
            الرسائل الخدمية التي وافقت عليها. ما منبيع معلوماتك وما منستخدمها لإعلانات طرف ثالث،
            وما منشاركها إلا مع مزوّدي الاستضافة التشغيليين أو عند وجود إلزام قانوني.
          </p>
          <p>
            <strong>حذف البيانات:</strong> بإمكانك بأي وقت طلب الاطلاع على بياناتك أو تصحيحها أو
            حذفها، إما بإرسال إيميل إلى{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> مع ذكر رقم الواتسآب الذي
            تواصلت منه، أو بإرسال رسالة واتسآب تطلب فيها الحذف. منحذف بياناتك خلال 30 يوم من تأكيد
            الطلب.
          </p>
        </div>

        <footer className="legalFooter">
          <Link href="/">Home</Link>
          <span>·</span>
          <Link href="/terms">Terms of Service</Link>
          <span>·</span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </footer>
      </article>
    </main>
  );
}
