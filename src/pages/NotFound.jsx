import { Link } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';

// Catch-all for unknown URLs. Without this, React Router silently rendered
// nothing and users saw a blank page after a typo or stale link.
export default function NotFound() {
  return (
    <>
      <SvgDefs />
      <main className="auth-shell" style={{ textAlign: 'center', padding: '64px 20px' }}>
        <section className="auth-card" style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 64, lineHeight: 1, marginBottom: 18, color: '#d6a83a' }} aria-hidden="true">✦</div>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 36, fontWeight: 400, fontStyle: 'italic', margin: '0 0 8px' }}>
            Lost the trail.
          </h1>
          <p style={{ color: 'var(--ink-soft)', margin: '0 0 24px', fontSize: 15, lineHeight: 1.55 }}>
            That page doesn't exist — maybe a typo, maybe a link that's gone stale.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="profile-btn profile-btn-primary">Back to home</Link>
            <Link to="/upload" className="profile-btn">Start tracing</Link>
          </div>
        </section>
      </main>
    </>
  );
}
