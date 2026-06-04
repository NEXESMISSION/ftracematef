import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import Footer from '../components/Footer.jsx';
import NotFound from './NotFound.jsx';
import {
  CHARACTER_BY_SLUG, getRelated,
  charTitle, charLead, charWhy, charSteps, charFaqs,
} from '../lib/characters.js';

/**
 * /draw/:slug — minimalist "How to draw <character>" SEO landing page.
 *
 * Content + copy come from src/lib/characters.js, which the build-time
 * prerender script (scripts/prerender-routes.mjs) ALSO reads, so the static
 * HTML crawlers get is identical to this. No copyrighted artwork is shown —
 * the page teaches the user to trace their own reference.
 */
export default function DrawCharacter() {
  const { slug } = useParams();
  const c = CHARACTER_BY_SLUG[slug];

  useEffect(() => {
    if (!c) return undefined;
    const prev = document.title;
    document.title = charTitle(c);
    return () => { document.title = prev; };
  }, [c]);

  // Unknown character → real 404 (keeps crawlers from indexing empty slugs).
  if (!c) return <NotFound />;

  const steps = charSteps(c);
  const faqs = charFaqs(c);
  const related = getRelated(c.slug, 6);

  return (
    <>
      <SvgDefs />
      <Link to="/draw" className="auth-back" aria-label="All characters">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 2 L3 7 L8 12 M3 7 H12" />
        </svg>
        All characters
      </Link>

      <main className="guide-shell">
        <article className="guide-card">
          <p className="guide-eyebrow">Draw {c.franchise}</p>
          <h1>How to draw {c.name}</h1>
          <p className="guide-lead">{charLead(c)}</p>

          <div className="guide-cta-row">
            <Link to="/upload" className="guide-cta">Start tracing free →</Link>
            <Link to="/pricing" className="guide-cta-ghost">See pricing</Link>
          </div>

          <h2>Why trace {c.short}?</h2>
          <p>{charWhy(c)}</p>

          <h2>Trace {c.short} in 5 steps</h2>
          <ol className="guide-steps">
            {steps.map((s) => (
              <li key={s.title}><strong>{s.title}.</strong> {s.text}</li>
            ))}
          </ol>

          <h2>Tips for drawing {c.short}</h2>
          <ul>
            {c.tips.map((t) => <li key={t}>{t}</li>)}
          </ul>

          <h2>{c.short} — frequently asked questions</h2>
          {faqs.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}

          <h2>More characters to draw</h2>
          <div className="draw-related">
            {related.map((r) => (
              <Link key={r.slug} to={`/draw/${r.slug}`} className="draw-related-chip">
                {r.short} <span>{r.franchise}</span>
              </Link>
            ))}
          </div>

          <div className="guide-cta-row guide-cta-row-end">
            <Link to="/upload" className="guide-cta">Trace {c.short} now →</Link>
            <Link to="/draw" className="guide-cta-ghost">Browse all characters</Link>
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}
