import { Link } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import Footer from '../components/Footer.jsx';

// Plain-English Terms of Service. Required for Google OAuth consent screen
// review and basic payments compliance. Not legal advice — operator should
// have a lawyer review before launch in regulated markets.
export default function Terms() {
  return (
    <>
      <SvgDefs />
      <Link to="/" className="auth-back" aria-label="Back to home">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 2 L3 7 L8 12 M3 7 H12" />
        </svg>
        Back
      </Link>

      <main className="legal-shell">
        <article className="legal-card">
          <h1>Terms of Service</h1>
          <p className="legal-meta">Last updated: April 30, 2026</p>

          <p>
            Welcome to TraceMate. These Terms of Service ("Terms") govern your
            use of <a href="https://www.tracemate.art">tracemate.art</a> (the
            "Service"), operated by TraceMate ("we", "us", "our"). By using
            the Service, you agree to these Terms.
          </p>

          <h2>1. The Service</h2>
          <p>
            TraceMate is a browser-based augmented-reality tracing tool. You
            point your phone camera at paper, upload any reference image, and
            the image appears as a live overlay you can trace by hand.
            Reference images stay on your device — we do not upload them to
            our servers for processing.
          </p>

          <h2>2. Accounts</h2>
          <p>
            Some features require an account. We use Google Sign-In via
            Supabase Auth — your Google email and basic profile (name, avatar)
            are stored to identify you across sessions. You are responsible
            for keeping your Google account secure. You can sign out or
            request account deletion at any time by emailing{' '}
            <a href="mailto:hi@tracemate.art">hi@tracemate.art</a>.
          </p>

          <h2>3. Plans and payment</h2>
          <p>
            Paid plans are processed by <strong>Dodo Payments</strong>. We do
            not see or store your card details. By starting a checkout you
            also agree to Dodo's terms.
          </p>
          <ul>
            <li><strong>Monthly</strong> — $5/month, billed every month, cancel anytime.</li>
            <li><strong>3 Months</strong> — $10 every 3 months, cancel anytime.</li>
            <li><strong>Lifetime</strong> — $15 one-time, capped at 10 spots.</li>
          </ul>
          <p>
            Subscriptions renew automatically until you cancel. You can cancel
            at the end of your current billing period from the Account page.
            <strong> 14-day refund:</strong> if you're not satisfied, email us
            within 14 days of purchase and we'll refund in full. Lifetime
            purchases are also covered by the 14-day window.
          </p>

          <h2>4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service to trace images you do not have rights to use.</li>
            <li>Reverse-engineer, scrape, or rate-limit-evade the Service.</li>
            <li>Share or resell access to a paid account.</li>
            <li>Upload illegal, harmful, or infringing content.</li>
          </ul>
          <p>
            We may suspend accounts that violate these rules. We do not
            inspect your reference images — content moderation is your
            responsibility.
          </p>

          <h2>5. Intellectual property</h2>
          <p>
            You retain all rights to the images you upload and the drawings
            you produce. The TraceMate name, logo, and software are owned by
            us. You get a non-exclusive, non-transferable license to use the
            Service while your account is in good standing.
          </p>

          <h2>6. Disclaimers</h2>
          <p>
            The Service is provided "as is" without warranties of any kind.
            AR overlay accuracy depends on your camera, lighting, and device —
            results vary. We don't guarantee the Service will be uninterrupted
            or error-free.
          </p>

          <h2>7. Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, our total liability for
            any claim is limited to the amount you paid us in the 12 months
            before the claim. We're not liable for indirect, consequential,
            or punitive damages.
          </p>

          <h2>8. Termination</h2>
          <p>
            You can stop using the Service and request account deletion at
            any time. We may terminate accounts for violations of these
            Terms. Active subscriptions cancel at the end of the billing
            period; lifetime access ends if your account is terminated for
            cause.
          </p>

          <h2>9. Changes</h2>
          <p>
            We may update these Terms occasionally. We'll update the date
            above; significant changes will be announced by email. Continued
            use after changes means you accept them.
          </p>

          <h2>10. Contact</h2>
          <p>
            Questions or concerns? Email{' '}
            <a href="mailto:hi@tracemate.art">hi@tracemate.art</a>.
          </p>

          <p className="legal-foot">
            See also our <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </article>
      </main>

      <Footer />
    </>
  );
}
