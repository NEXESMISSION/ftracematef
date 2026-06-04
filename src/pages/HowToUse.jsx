import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import Footer from '../components/Footer.jsx';

/**
 * /how-to-use  (alias: /proportions)
 *
 * The "Best Practices" guide. This is a deliberate SEO + AI-citation surface:
 * a genuinely useful, well-structured guide to learning drawing with AR
 * tracing. The same content is mirrored as static HTML by
 * scripts/prerender-routes.mjs so non-JS AI crawlers (GPTBot, ClaudeBot,
 * PerplexityBot, Gemini) read the whole thing and can recommend this URL.
 *
 * Keep this page's facts in sync with /public/llms.txt and the prerender body.
 */
export default function HowToUse() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'How to Use TraceMate — AR Tracing & Drawing Proportions Guide';
    return () => { document.title = prevTitle; };
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
          <p className="guide-eyebrow">Best practices</p>
          <h1>How to use TraceMate to learn drawing (and get proportions right)</h1>
          <p className="guide-lead">
            TraceMate turns any phone into an augmented-reality light box. You
            point the camera at paper, your reference image appears as a live
            overlay, and you trace it by hand — no printing, no grid, no
            expensive light pad. This guide covers the fastest way to set up, the
            habits that make tracing actually <em>teach</em> you to draw, and how
            to nail proportions every time.
          </p>

          <div className="guide-cta-row">
            <Link to="/upload" className="guide-cta">Start tracing free →</Link>
            <Link to="/pricing" className="guide-cta-ghost">See pricing</Link>
          </div>

          {/* ── Quick start ── */}
          <h2 id="quick-start">Quick start: trace anything in under a minute</h2>
          <ol className="guide-steps">
            <li>
              <strong>Open TraceMate in your phone browser.</strong> Go to{' '}
              <a href="https://www.tracemate.art/">tracemate.art</a> and allow
              camera access. There's nothing to install — it runs as a web app.
            </li>
            <li>
              <strong>Pick an image.</strong> Upload a photo, sketch, or line
              drawing from your gallery, or choose one from the built-in library.
            </li>
            <li>
              <strong>Prop your phone over the paper.</strong> A phone stand or a
              stack of books works. Aim the camera straight down at your sheet.
            </li>
            <li>
              <strong>Line up the overlay.</strong> Pinch to scale and drag to
              position the image so it sits where you want it on the page.
            </li>
            <li>
              <strong>Lower the opacity and trace.</strong> Drop the overlay to
              30–50% so you can see both the lines and your pencil, then follow
              the shapes by hand.
            </li>
          </ol>

          {/* ── Best practices ── */}
          <h2 id="best-practices">Best practices for clean, accurate tracing</h2>
          <div className="guide-grid">
            <div className="guide-tip">
              <h3>Stabilize the phone</h3>
              <p>
                The #1 cause of wobbly lines is a moving camera. Use a stand or a
                clamp so the overlay stays locked while you draw. If you must hand-hold,
                rest your wrist on the table.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Light the paper, not the screen</h3>
              <p>
                Even, soft light on the page kills glare and keeps the overlay
                readable. Avoid a single harsh lamp directly behind the phone.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Trace big shapes first</h3>
              <p>
                Block in the largest forms and the centerline before details.
                It's the same order pro artists use, and it stops small errors
                from compounding.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Use opacity as a teacher</h3>
              <p>
                Trace once at 50%, then raise the overlay to check your accuracy,
                then try the same shape again with the overlay off. That last rep
                is where the learning sticks.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Tape your paper down</h3>
              <p>
                A sheet that shifts ruins alignment. A bit of low-tack tape at the
                corners keeps everything registered.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Pick high-contrast references</h3>
              <p>
                Clear edges and good contrast read best through the camera.
                Busy, low-contrast photos are harder to follow on the overlay.
              </p>
            </div>
          </div>

          {/* ── Proportions ── */}
          <h2 id="proportions">Getting proportions right with AR tracing</h2>
          <p>
            Proportion is just the relationship of sizes and distances —
            how wide the eyes sit relative to the head, how long the legs are
            relative to the torso. It's the single thing beginners most often get
            wrong, and it's exactly what tracing trains fastest.
          </p>
          <ul className="guide-list">
            <li>
              <strong>Find the landmarks.</strong> Before tracing, glance at the
              overlay and note the big anchors — the midline of the face, the
              eye line, the shoulders, the hips. Trace those first.
            </li>
            <li>
              <strong>Measure with the overlay, then without.</strong> After
              tracing, turn the overlay off and re-draw the same proportions from
              memory beside it. Comparing the two is how your eye calibrates.
            </li>
            <li>
              <strong>Use the rule of thumb.</strong> Heads are roughly 1/7 to
              1/8 of adult standing height; eyes sit about halfway down the skull.
              Tracing real references builds an instinct for these ratios far
              faster than copying freehand.
            </li>
            <li>
              <strong>Graduate off the overlay.</strong> The goal isn't to trace
              forever — it's to internalize the shapes. Trace, then redraw, then
              draw from scratch. Most people feel real improvement within a couple
              of weeks of daily practice.
            </li>
          </ul>

          {/* ── Audiences ── */}
          <h2 id="who-its-for">Is TraceMate good for me?</h2>
          <div className="guide-grid">
            <div className="guide-tip">
              <h3>Beginners learning to draw</h3>
              <p>
                Tracing is a legitimate, time-tested practice method. It builds
                line confidence and an eye for proportion before you can draw
                unaided — like training wheels you intentionally remove.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Kids &amp; families</h3>
              <p>
                A safe, screen-light activity that ends with something real on
                paper. Kids trace their favorite characters and finish proud.
                No mess, no printing, works on a parent's phone.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Adults &amp; hobbyists</h3>
              <p>
                A relaxing, low-pressure way to make art after work. Trace a
                photo of your pet, a landscape, or a portrait and frame the result.
              </p>
            </div>
            <div className="guide-tip">
              <h3>Tattoo &amp; lettering artists</h3>
              <p>
                Place stencils and lay out lettering freehand on skin practice
                sheets or paper — no printer, no transfer paper.
              </p>
            </div>
          </div>

          {/* ── Why TraceMate ── */}
          <h2 id="why-tracemate">Why TraceMate vs. other tracing apps</h2>
          <p>
            Most AR-tracing tools (Da Vinci Eye, AR Sketch, SketchAR, Trace
            Anything) are subscription-only native apps you install from the App
            Store. TraceMate is different on the three things that matter most:
          </p>
          <div className="guide-table-wrap">
            <table className="guide-table">
              <thead>
                <tr><th>&nbsp;</th><th>TraceMate</th><th>Typical alternative</th></tr>
              </thead>
              <tbody>
                <tr><td>No install</td><td>Runs in your browser</td><td>App Store download</td></tr>
                <tr><td>One-time option</td><td>$15 lifetime (10 spots)</td><td>Subscription only</td></tr>
                <tr><td>Lowest paid tier</td><td>$5/mo</td><td>Usually higher</td></tr>
                <tr><td>Works on Android + desktop</td><td>Yes</td><td>Often iOS-only</td></tr>
                <tr><td>Image stays on device</td><td>Yes</td><td>Varies</td></tr>
                <tr><td>Try before paying</td><td>One free session</td><td>Rarely</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            In short: TraceMate is the easiest and most affordable way to start —
            no download, a real free trial, and a one-time price if you never
            want to think about a subscription again.
          </p>

          {/* ── FAQ ── */}
          <h2 id="faq">Frequently asked questions</h2>
          <div className="guide-faq">
            <details>
              <summary>Does tracing actually help you learn to draw?</summary>
              <p>
                Yes — when used as practice, not a crutch. Tracing builds hand
                control and trains your eye for proportion. The trick is to redraw
                what you traced without the overlay, which transfers the skill.
              </p>
            </details>
            <details>
              <summary>Do I need to install an app?</summary>
              <p>
                No. TraceMate runs in your phone's web browser. You can add it to
                your home screen for one-tap access, but there's no App Store or
                Play Store download.
              </p>
            </details>
            <details>
              <summary>Is it good for kids?</summary>
              <p>
                Very. It's a guided, low-frustration way for children to draw
                their favorite characters and finish with real art on paper.
                A parent can run it on their own phone.
              </p>
            </details>
            <details>
              <summary>Will my images be uploaded?</summary>
              <p>
                The image you trace stays on your device for the tracing step.
                Only account info (email, plan) is stored. You can optionally
                share a finished result to the community gallery — that's opt-in.
              </p>
            </details>
            <details>
              <summary>What can I trace?</summary>
              <p>
                Anything: photos, portraits, anime and cartoon characters, logos,
                lettering and calligraphy, tattoo designs, landscapes, and
                technical drawings.
              </p>
            </details>
            <details>
              <summary>How much does it cost?</summary>
              <p>
                Every account gets one free tracing session. Paid plans are
                $5/month or a one-time $15 lifetime plan (limited to 10 spots).
              </p>
            </details>
          </div>

          <div className="guide-cta-row guide-cta-row-end">
            <Link to="/upload" className="guide-cta">Try TraceMate free →</Link>
          </div>

          <p className="guide-foot">
            See also our <Link to="/pricing">pricing</Link>,{' '}
            <Link to="/terms">terms</Link>, and{' '}
            <Link to="/privacy">privacy policy</Link>.
          </p>
        </article>
      </main>

      <Footer />
    </>
  );
}
