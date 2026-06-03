import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import Img from './Img.jsx';

// Synchronously check localStorage for a Supabase session token, so we can
// render the right CTA on first paint instead of flashing the visitor CTA
// for ~1s while AuthProvider's getUser() round-trip resolves.
function hasPersistedSession() {
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) return true;
    }
  } catch { /* private mode / disabled storage */ }
  return false;
}

export default function Nav() {
  const { user, isPaid, loading } = useAuth();

  // Render the right CTA on first paint:
  //  - resolved + signed-in    → "See my profile" pill
  //  - resolved + signed-out   → "Try it Now" image
  //  - loading + has token     → "See my profile" pill (optimistic)
  //  - loading + no token      → "Try it Now" image
  const showSignedInCta = user || (loading && hasPersistedSession());

  return (
    <header className="nav tm-section-pad">
      <Link to="/" className="brand" aria-label="Trace Mate home">
        <Img src="/images/brand/logo-icon.webp" alt="" className="brand-icon" aria-hidden="true" priority />
        <Img src="/images/brand/logo.webp" alt="Trace Mate" className="brand-word" priority />
      </Link>

      <nav className="nav-links" aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#gallery">Gallery</a>
        {!isPaid && <a href="#pricing">Pricing</a>}
      </nav>

      {showSignedInCta ? (
        <Link className="nav-account-cta" to="/account" aria-label="See my profile">
          <span className="nav-account-cta-full">See my profile →</span>
          <span className="nav-account-cta-short">Profile →</span>
        </Link>
      ) : (
        <div className="nav-cta-group">
          {/* Returning users who already have an account go straight to sign-in. */}
          <Link className="nav-login-link" to="/login">Log in</Link>
          <a className="img-btn img-btn-sm" href="#pricing" aria-label="Try it Now">
            <Img src="/images/ui/btn-try-now.webp" alt="Try it Now" priority />
          </a>
        </div>
      )}
    </header>
  );
}
