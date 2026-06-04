import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import Footer from '../components/Footer.jsx';
import { CHARACTERS } from '../lib/characters.js';

/**
 * /draw — hub index for the "How to draw <character>" landing pages.
 * Internal-linking surface + a target for "anime characters to draw" queries.
 */
const TITLE = 'How to Draw Anime Characters — Easy AR Tracing Tutorials | TraceMate';

export default function DrawIndex() {
  useEffect(() => {
    const prev = document.title;
    document.title = TITLE;
    return () => { document.title = prev; };
  }, []);

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

      <main className="guide-shell">
        <article className="guide-card">
          <p className="guide-eyebrow">Step-by-step tutorials</p>
          <h1>How to draw anime characters</h1>
          <p className="guide-lead">
            Pick a character and learn to draw it the fast way — trace any
            reference straight onto real paper with TraceMate's AR overlay, then
            redraw it freehand. No app, no printing, one free session to try.
          </p>

          <div className="guide-cta-row">
            <Link to="/upload" className="guide-cta">Start tracing free →</Link>
            <Link to="/how-to-use" className="guide-cta-ghost">Read the guide</Link>
          </div>

          <h2>Characters</h2>
          <div className="draw-grid">
            {CHARACTERS.map((c) => (
              <Link key={c.slug} to={`/draw/${c.slug}`} className="draw-grid-card">
                <span className="draw-grid-name">How to draw {c.short}</span>
                <span className="draw-grid-meta">{c.franchise} · {c.difficulty}</span>
              </Link>
            ))}
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
