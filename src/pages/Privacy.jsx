import { Link } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import Footer from '../components/Footer.jsx';

// Plain-English Privacy Policy. Required for Google OAuth consent screen
// review and to comply with GDPR / CCPA disclosure obligations. Not legal
// advice — operator should have a lawyer review before launch in regulated
// markets.
export default function Privacy() {
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
          <h1>Privacy Policy</h1>
          <p className="legal-meta">Last updated: April 30, 2026</p>

          <p>
            This policy explains what data TraceMate collects, why, and what
            you can do about it. The short version: <strong>your reference
            images stay on your device</strong>; we only store the bare
            minimum needed to run your account and process payments.
          </p>

          <h2>What we collect</h2>

          <h3>From your Google account (when you sign in)</h3>
          <ul>
            <li>Email address</li>
            <li>Display name</li>
            <li>Profile picture URL</li>
          </ul>
          <p>
            Sign-in is handled by Supabase Auth using Google OAuth. We do
            not see your Google password.
          </p>

          <h3>About your subscription</h3>
          <ul>
            <li>Plan, status, billing period dates</li>
            <li>A non-sensitive Dodo customer ID and subscription ID</li>
            <li>Payment amounts and currency (for receipts)</li>
          </ul>
          <p>
            Card details are handled entirely by{' '}
            <strong>Dodo Payments</strong>. We never see or store them.
          </p>

          <h3>About your usage</h3>
          <p>
            The Account page shows trace stats — total time traced, session
            count. These are stored <strong>locally on your device</strong>{' '}
            (in your browser's localStorage), not on our servers.
          </p>

          <h3>What we do <em>not</em> collect</h3>
          <ul>
            <li>The reference images you upload — they stay in your browser.</li>
            <li>The drawings you produce — they exist only on real paper.</li>
            <li>Your camera feed — it never leaves your device.</li>
            <li>Analytics tracking, advertising IDs, or third-party trackers.</li>
          </ul>

          <h2>Why we collect it</h2>
          <ul>
            <li><strong>Email + name:</strong> to identify you across sessions and sign you in.</li>
            <li><strong>Subscription data:</strong> to grant access to paid features and show your billing status.</li>
            <li><strong>Dodo customer ID:</strong> to match incoming payment webhooks to your account.</li>
          </ul>

          <h2>Where it lives</h2>
          <p>
            Account data is stored on Supabase (PostgreSQL hosted in the EU
            or US, depending on your region). Payment data is held by Dodo
            Payments per their privacy policy. Both are SOC 2 / PCI compliant.
          </p>

          <h2>Sharing</h2>
          <p>
            We do <strong>not</strong> sell your data, ever. We share with:
          </p>
          <ul>
            <li><strong>Supabase</strong> — to host your account.</li>
            <li><strong>Dodo Payments</strong> — to process payments.</li>
            <li><strong>Google</strong> — only for OAuth sign-in.</li>
            <li><strong>Authorities</strong> — only when legally required.</li>
          </ul>

          <h2>Cookies and storage</h2>
          <p>
            We use <strong>localStorage</strong> and <strong>sessionStorage</strong>{' '}
            (not cookies) to keep you signed in, remember your studio
            preferences (overlay opacity, camera choice), and stash your
            uploaded image across redirects. No tracking cookies. No third-party
            cookies.
          </p>

          <h2>Your rights</h2>
          <p>
            Depending on where you live, you may have the right to:
          </p>
          <ul>
            <li>Access the data we hold about you.</li>
            <li>Correct inaccurate data.</li>
            <li>Delete your account and all associated data.</li>
            <li>Export your data in a portable format.</li>
            <li>Object to or restrict processing.</li>
          </ul>
          <p>
            To exercise any of these, email{' '}
            <a href="mailto:hi@tracemate.art">hi@tracemate.art</a>. We respond
            within 30 days. There is no charge.
          </p>

          <h2>Children</h2>
          <p>
            TraceMate is not directed at children under 13. We do not
            knowingly collect data from anyone under 13. If a child has
            created an account, contact us and we'll delete it.
          </p>

          <h2>Retention</h2>
          <p>
            We keep account data while your account is open. After deletion,
            we erase active records within 30 days; some payment records
            may be retained longer where required by tax/accounting law.
          </p>

          <h2>Security</h2>
          <p>
            All traffic is encrypted in transit (HTTPS). Database access is
            restricted by Row-Level Security: your subscription and profile
            rows are readable only by you. Payment webhooks are signature-
            verified before processing.
          </p>

          <h2>Changes</h2>
          <p>
            We may update this policy. We'll update the date above; material
            changes will be announced by email.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about your data? Email{' '}
            <a href="mailto:hi@tracemate.art">hi@tracemate.art</a>.
          </p>

          <p className="legal-foot">
            See also our <Link to="/terms">Terms of Service</Link>.
          </p>
        </article>
      </main>

      <Footer />
    </>
  );
}
