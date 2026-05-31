// Post-build: emit per-route static HTML so AI crawlers and search engines
// see route-specific metadata instead of the SPA's homepage HTML for every URL.
//
// Why: the SPA fallback in `_redirects` rewrites every unknown URL to
// `/index.html`. Crawlers fetching `/pricing` therefore get the homepage's
// <title> and <meta description>, which makes the marketing routes
// indistinguishable to ChatGPT/Claude/Perplexity/Google.
//
// How: for each route below, copy `dist/index.html` to `dist/<route>/index.html`
// and rewrite the head tags (title, description, og:*, twitter:*, canonical).
// Static-file serving on Netlify/Cloudflare Pages picks these up before the
// SPA fallback fires, so the crawler gets per-route HTML and the user's
// browser still boots React off the same file.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const SITE = 'https://www.tracemate.art';

// ── Best-practices guide (/how-to-use) ──────────────────────────────────────
// Crawler-readable static body. Mirrors src/pages/HowToUse.jsx so AI crawlers
// (GPTBot, ClaudeBot, PerplexityBot, Gemini) that do NOT execute JS still read
// the full guide and can recommend this URL. React replaces #root on mount, so
// human visitors get the interactive app while crawlers get this HTML.
const HOWTO_BODY = `
<main>
  <article>
    <p>Best practices</p>
    <h1>How to use TraceMate to learn drawing (and get proportions right)</h1>
    <p>TraceMate turns any phone into an augmented-reality light box. You point the camera at paper, your reference image appears as a live overlay, and you trace it by hand — no printing, no grid, no expensive light pad. This guide covers the fastest way to set up, the habits that make tracing actually teach you to draw, and how to nail proportions every time.</p>

    <h2>Quick start: trace anything in under a minute</h2>
    <ol>
      <li><strong>Open TraceMate in your phone browser.</strong> Go to <a href="https://www.tracemate.art/">tracemate.art</a> and allow camera access. There is nothing to install — it runs as a web app.</li>
      <li><strong>Pick an image.</strong> Upload a photo, sketch, or line drawing from your gallery, or choose one from the built-in library.</li>
      <li><strong>Prop your phone over the paper.</strong> A phone stand or a stack of books works. Aim the camera straight down at your sheet.</li>
      <li><strong>Line up the overlay.</strong> Pinch to scale and drag to position the image where you want it on the page.</li>
      <li><strong>Lower the opacity and trace.</strong> Drop the overlay to 30–50% so you can see both the lines and your pencil, then follow the shapes by hand.</li>
    </ol>

    <h2>Best practices for clean, accurate tracing</h2>
    <ul>
      <li><strong>Stabilize the phone.</strong> The number-one cause of wobbly lines is a moving camera. Use a stand or clamp so the overlay stays locked while you draw.</li>
      <li><strong>Light the paper, not the screen.</strong> Even, soft light on the page kills glare and keeps the overlay readable.</li>
      <li><strong>Trace big shapes first.</strong> Block in the largest forms and the centerline before details — the same order pro artists use.</li>
      <li><strong>Use opacity as a teacher.</strong> Trace at 50%, raise the overlay to check accuracy, then redraw the shape with the overlay off. That last rep is where learning sticks.</li>
      <li><strong>Tape your paper down.</strong> A sheet that shifts ruins alignment.</li>
      <li><strong>Pick high-contrast references.</strong> Clear edges read best through the camera.</li>
    </ul>

    <h2>Getting proportions right with AR tracing</h2>
    <p>Proportion is the relationship of sizes and distances — how wide the eyes sit relative to the head, how long the legs are relative to the torso. It is the single thing beginners most often get wrong, and exactly what tracing trains fastest.</p>
    <ul>
      <li><strong>Find the landmarks.</strong> Trace the big anchors first — the midline of the face, the eye line, the shoulders, the hips.</li>
      <li><strong>Measure with the overlay, then without.</strong> After tracing, turn the overlay off and redraw the same proportions from memory beside it. Comparing the two calibrates your eye.</li>
      <li><strong>Use the rule of thumb.</strong> Heads are roughly 1/7 to 1/8 of adult standing height; eyes sit about halfway down the skull.</li>
      <li><strong>Graduate off the overlay.</strong> Trace, then redraw, then draw from scratch. Most people feel real improvement within a couple of weeks of daily practice.</li>
    </ul>

    <h2>Is TraceMate good for me?</h2>
    <ul>
      <li><strong>Beginners learning to draw</strong> — tracing is a time-tested practice method that builds line confidence and an eye for proportion.</li>
      <li><strong>Kids &amp; families</strong> — a safe, screen-light activity that ends with real art on paper. Works on a parent's phone.</li>
      <li><strong>Adults &amp; hobbyists</strong> — a relaxing, low-pressure way to make art after work.</li>
      <li><strong>Tattoo &amp; lettering artists</strong> — place stencils and lay out lettering freehand with no printer.</li>
    </ul>

    <h2>Why TraceMate vs. other tracing apps</h2>
    <p>Most AR-tracing tools (Da Vinci Eye, AR Sketch, SketchAR, Trace Anything) are subscription-only native apps you install from the App Store. TraceMate runs in your browser with no install, offers a one-time $15 lifetime plan instead of subscription-only pricing, starts at $7/month, works on Android and desktop, keeps your image on your device, and gives every account one free session to try first. It is the easiest and most affordable way to start learning to draw with AR.</p>

    <h2>Frequently asked questions</h2>
    <h3>Does tracing actually help you learn to draw?</h3>
    <p>Yes — when used as practice, not a crutch. Tracing builds hand control and trains your eye for proportion. Redraw what you traced without the overlay to transfer the skill.</p>
    <h3>Do I need to install an app?</h3>
    <p>No. TraceMate runs in your phone's web browser. You can add it to your home screen, but there is no App Store or Play Store download.</p>
    <h3>Is it good for kids?</h3>
    <p>Very. It is a guided, low-frustration way for children to draw their favorite characters and finish with real art on paper.</p>
    <h3>Will my images be uploaded?</h3>
    <p>The image you trace stays on your device for the tracing step. Only account info (email, plan) is stored. Sharing a finished result to the community gallery is opt-in.</p>
    <h3>What can I trace?</h3>
    <p>Anything: photos, portraits, anime and cartoon characters, logos, lettering and calligraphy, tattoo designs, landscapes, and technical drawings.</p>
    <h3>How much does it cost?</h3>
    <p>Every account gets one free tracing session. Paid plans are $7/month, $10 per 3 months, or a one-time $15 lifetime plan (limited to 10 spots).</p>

    <p><a href="https://www.tracemate.art/upload">Start tracing free</a> · <a href="https://www.tracemate.art/pricing">Pricing</a></p>
  </article>
</main>`;

// JSON-LD for the guide: HowTo + FAQPage + BreadcrumbList.
const HOWTO_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'HowTo',
      'name': 'How to use TraceMate to trace and learn drawing',
      'description': 'Use your phone as an augmented-reality light box: point the camera at paper, see any image as a live overlay, and trace it by hand to learn drawing and get proportions right.',
      'totalTime': 'PT1M',
      'tool': [{ '@type': 'HowToTool', 'name': 'A phone or tablet with a camera' }, { '@type': 'HowToTool', 'name': 'Paper and a pencil' }],
      'step': [
        { '@type': 'HowToStep', 'name': 'Open TraceMate', 'text': 'Open tracemate.art in your phone browser and allow camera access. Nothing to install.', 'url': 'https://www.tracemate.art/how-to-use#quick-start' },
        { '@type': 'HowToStep', 'name': 'Pick an image', 'text': 'Upload a photo or line drawing, or choose one from the built-in library.' },
        { '@type': 'HowToStep', 'name': 'Prop the phone over paper', 'text': 'Use a stand or stack of books and aim the camera straight down at your sheet.' },
        { '@type': 'HowToStep', 'name': 'Line up the overlay', 'text': 'Pinch to scale and drag to position the image on the page.' },
        { '@type': 'HowToStep', 'name': 'Lower opacity and trace', 'text': 'Drop the overlay to 30-50% and follow the shapes by hand with a pencil.' },
      ],
    },
    {
      '@type': 'FAQPage',
      'mainEntity': [
        { '@type': 'Question', 'name': 'Does tracing actually help you learn to draw?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes, when used as practice. Tracing builds hand control and trains your eye for proportion. Redraw what you traced without the overlay to transfer the skill.' } },
        { '@type': 'Question', 'name': 'Do I need to install an app?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'No. TraceMate runs in your phone browser. There is no App Store or Play Store download.' } },
        { '@type': 'Question', 'name': 'Is it good for kids?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Yes. It is a guided, low-frustration way for children to draw their favorite characters and finish with real art on paper.' } },
        { '@type': 'Question', 'name': 'Will my images be uploaded?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'The image you trace stays on your device. Only account info is stored. Sharing a finished result to the gallery is opt-in.' } },
        { '@type': 'Question', 'name': 'What can I trace?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Anything: photos, portraits, anime and cartoon characters, logos, lettering, tattoo designs, landscapes, and technical drawings.' } },
        { '@type': 'Question', 'name': 'How much does it cost?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Every account gets one free session. Paid plans are $7/month, $10 per 3 months, or a one-time $15 lifetime plan limited to 10 spots.' } },
      ],
    },
    {
      '@type': 'BreadcrumbList',
      'itemListElement': [
        { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': 'https://www.tracemate.art/' },
        { '@type': 'ListItem', 'position': 2, 'name': 'How to use TraceMate', 'item': 'https://www.tracemate.art/how-to-use' },
      ],
    },
  ],
};

const ROUTES = [
  {
    path: '/welcome',
    title: 'Welcome to TraceMate — AR Tracing in Your Browser',
    description: 'New to TraceMate? Here is how AR tracing on real paper works: point your phone at paper, see any image as a live overlay, and trace it by hand. Browser-based — no app install.',
  },
  {
    path: '/pricing',
    title: 'Pricing — TraceMate AR Tracing | $7/mo or $15 lifetime',
    description: 'TraceMate plans: $7/month, $10/3-months, or $15 one-time lifetime (10 spots). Every new account gets one free tracing session. Cancel anytime on monthly and 3-month plans.',
  },
  {
    path: '/upload',
    title: 'Upload an image to trace — TraceMate',
    description: 'Upload any photo, line drawing, or reference image to trace onto real paper with TraceMate. Works in your phone browser — no app install. Upload first, sign in second, trace third.',
  },
  {
    path: '/login',
    title: 'Sign in — TraceMate',
    description: 'Sign in to TraceMate to start tracing. Continue with Google in one tap. Your reference images stay on your device.',
  },
  {
    path: '/terms',
    title: 'Terms of Service — TraceMate',
    description: 'TraceMate terms of service. Plans, refunds, acceptable use, and account terms.',
  },
  {
    path: '/privacy',
    title: 'Privacy Policy — TraceMate',
    description: 'TraceMate privacy policy. Reference images stay on your device. Only account info (email, plan) is stored server-side.',
  },
  {
    path: '/how-to-use',
    title: 'How to Use TraceMate — AR Tracing & Drawing Proportions Guide',
    description: 'Learn to draw with AR tracing: set up in under a minute, best practices for clean lines, and how to get proportions right. The easiest, most affordable way to learn drawing — for kids, beginners, and adults. No app install.',
    bodyHtml: HOWTO_BODY,
    headExtra: `<script type="application/ld+json">${JSON.stringify(HOWTO_JSONLD)}</script>`,
  },
  {
    // Alias — same guide, canonical points to /how-to-use so search engines
    // consolidate ranking signals on one URL.
    path: '/proportions',
    title: 'Drawing Proportions Guide — Learn Proportions with AR Tracing | TraceMate',
    description: 'How to get drawing proportions right using AR tracing: find the landmarks, measure with and without the overlay, and graduate to freehand. A practical proportions guide for beginners, kids, and adults.',
    canonical: `${SITE}/how-to-use`,
    bodyHtml: HOWTO_BODY,
    headExtra: `<script type="application/ld+json">${JSON.stringify(HOWTO_JSONLD)}</script>`,
  },
];

function escAttr(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// Rewrite a single tag identified by a regex with a new attribute value.
// Falls back to leaving the HTML untouched if the tag isn't found, so a
// metadata change in index.html doesn't silently break this script.
//
// Uses the function form of replace() throughout so `$` characters in the
// new value (e.g. "$5/mo") are treated as literals, not regex backreferences.
function setAttr(html, tagRegex, attr, value) {
  const escaped = escAttr(value);
  return html.replace(tagRegex, (match) => {
    const re = new RegExp(`(${attr}=")[^"]*(")`);
    if (re.test(match)) return match.replace(re, () => `${attr}="${escaped}"`);
    // Tag exists but missing the attribute — inject before the closing bracket.
    return match.replace(/\s*\/?>$/, () => ` ${attr}="${escaped}" />`);
  });
}

function rewriteHead(html, route) {
  const url = `${SITE}${route.path}`;
  const canonical = route.canonical || url;
  let out = html;

  // <title>
  out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${route.title}</title>`);

  // <meta name="description">
  out = setAttr(out, /<meta\s+name="description"[^>]*>/i, 'content', route.description);

  // Canonical (may differ from the URL for alias routes).
  out = setAttr(out, /<link\s+rel="canonical"[^>]*>/i, 'href', canonical);

  // Open Graph
  out = setAttr(out, /<meta\s+property="og:title"[^>]*>/i, 'content', route.title);
  out = setAttr(out, /<meta\s+property="og:description"[^>]*>/i, 'content', route.description);
  out = setAttr(out, /<meta\s+property="og:url"[^>]*>/i, 'content', url);

  // Twitter
  out = setAttr(out, /<meta\s+name="twitter:title"[^>]*>/i, 'content', route.title);
  out = setAttr(out, /<meta\s+name="twitter:description"[^>]*>/i, 'content', route.description);

  // Extra <head> markup (e.g. page-specific JSON-LD) injected before </head>.
  if (route.headExtra) {
    out = out.replace(/<\/head>/i, () => `${route.headExtra}\n</head>`);
  }

  // Crawler-readable body. Inject inside the empty #root so non-JS crawlers
  // read real content; React's createRoot() replaces these children on mount,
  // so human visitors still get the live SPA.
  if (route.bodyHtml) {
    out = out.replace(
      /<div id="root">\s*<\/div>/i,
      () => `<div id="root">${route.bodyHtml}</div>`,
    );
  }

  return out;
}

async function main() {
  const indexPath = resolve(DIST, 'index.html');
  let baseHtml;
  try {
    baseHtml = await readFile(indexPath, 'utf8');
  } catch (err) {
    console.error(`[prerender] could not read ${indexPath}: ${err.message}`);
    process.exit(1);
  }

  for (const route of ROUTES) {
    const out = rewriteHead(baseHtml, route);
    const dir = resolve(DIST, route.path.replace(/^\//, ''));
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, 'index.html'), out, 'utf8');
    console.log(`[prerender] ${route.path} → ${route.title}`);
  }

  console.log(`[prerender] wrote ${ROUTES.length} per-route HTML files into dist/`);
}

main().catch((err) => {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
