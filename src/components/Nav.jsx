import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';

export default function Nav() {
  const { user, isPaid } = useAuth();

  return (
    <header className="nav tm-section-pad">
      <a href="#" className="brand" aria-label="Trace Mate home">
        <img src="/images/brand/logo-icon.webp" alt="" className="brand-icon" aria-hidden="true" />
        <img src="/images/brand/logo.webp" alt="Trace Mate" />
      </a>

      <nav className="nav-links" aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#gallery">Gallery</a>
        {!isPaid && <a href="#pricing">Pricing</a>}
      </nav>

      {user ? (
        <Link className="img-btn img-btn-sm" to="/account" aria-label="Your account">
          <img src="/images/ui/btn-try-now.webp" alt="Account" />
        </Link>
      ) : (
        <Link className="img-btn img-btn-sm" to="/login" aria-label="Try it Now">
          <img src="/images/ui/btn-try-now.webp" alt="Try it Now" />
        </Link>
      )}
    </header>
  );
}
