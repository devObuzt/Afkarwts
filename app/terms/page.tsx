import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Afkar — Eat. Love. Fit",
  description: "Terms of service for Afkar (Eat. Love. Fit) WhatsApp communication services."
};

const CONTACT_EMAIL = "support@eat-love-fit.com";

export default function TermsPage() {
  return (
    <main className="legalShell">
      <article className="legalPanel">
        <header className="legalHeader">
          <span className="brandMark">A</span>
          <div>
            <h1>Terms of Service</h1>
            <p>Afkar — Eat. Love. Fit · Effective date: August 2, 2026</p>
          </div>
        </header>

        <section>
          <h2>1. The service</h2>
          <p>
            Afkar (&quot;Eat. Love. Fit&quot;, &quot;we&quot;, &quot;us&quot;) offers nutrition and healthy-lifestyle
            programs and communicates with members over WhatsApp through the WhatsApp Business
            Platform. By messaging us on WhatsApp or using this website, you agree to these terms.
          </p>
        </section>

        <section>
          <h2>2. Using the service</h2>
          <ul>
            <li>You must be at least 16 years old to use the service.</li>
            <li>
              You agree not to send unlawful, abusive, or misleading content, and not to attempt to
              disrupt or gain unauthorized access to our systems.
            </li>
            <li>
              Guidance shared in our programs is general wellness information and is not a
              substitute for professional medical advice. Consult a qualified professional before
              making health decisions.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Privacy</h2>
          <p>
            Our handling of your personal information is described in our{" "}
            <Link href="/privacy">Privacy Policy</Link>, including how to request deletion of your
            data.
          </p>
        </section>

        <section>
          <h2>4. Intellectual property</h2>
          <p>
            All content we provide — including program materials, texts, and media — belongs to
            Afkar or its licensors and is intended for your personal, non-commercial use.
          </p>
        </section>

        <section>
          <h2>5. Liability</h2>
          <p>
            The service is provided &quot;as is&quot;. To the maximum extent permitted by law, we are not
            liable for indirect or consequential damages arising from the use of the service,
            including interruptions of WhatsApp itself, which is operated by Meta.
          </p>
        </section>

        <section>
          <h2>6. Changes and contact</h2>
          <p>
            We may update these terms from time to time; the latest version will always be
            available on this page. Questions are welcome at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>

        <footer className="legalFooter">
          <Link href="/">Home</Link>
          <span>·</span>
          <Link href="/privacy">Privacy Policy</Link>
          <span>·</span>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </footer>
      </article>
    </main>
  );
}
