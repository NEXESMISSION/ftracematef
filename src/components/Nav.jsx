import { Link } from 'react-router-dom';

export default function Nav() {
  return (
    <header className="nav tm-section-pad">
      <a href="#" className="brand" aria-label="Trace Mate home">
        <img src="/images/brand/logo-icon.webp" alt="" className="brand-icon" aria-hidden="true" />
        <img src="/images/brand/logo.webp" alt="Trace Mate" />
      </a>

      <nav className="nav-links" aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#gallery">Gallery</a>
        <a href="#pricing">Pricing</a>
      </nav>

      <Link className="img-btn img-btn-sm" to="/login" aria-label="Try it Now">
        <img src="/images/ui/btn-try-now.webp" alt="Try it Now" />
      </Link>
    </header>
  );
}
