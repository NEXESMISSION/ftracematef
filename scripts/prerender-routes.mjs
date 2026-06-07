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
import {
  CHARACTERS, getRelated,
  charTitle, charDescription, charLead, charWhy, charSteps, charFaqs,
} from '../src/lib/characters.js';
import { VISIBLE_PLANS } from '../src/lib/plans.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');
const SITE = 'https://www.tracemate.art';

// Escape text destined for HTML body markup.
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Visually-hidden (sr-only) inline style for the prerendered crawler body.
// The static content stays in the HTML source (so non-JS crawlers like GPTBot/
// ClaudeBot and Google's raw fetch read it), but humans never SEE it — which
// kills the flash-of-unstyled-text on first paint. React's createRoot() then
// replaces #root's children on mount, so the live styled app takes over with
// no visible jump. (Google renders the JS app, so it indexes the real content.)
const SR_ONLY = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';

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
    <p>Most AR-tracing tools (Da Vinci Eye, AR Sketch, SketchAR, Trace Anything) are subscription-only native apps you install from the App Store. TraceMate runs in your browser with no install, offers a one-time $15 lifetime plan instead of subscription-only pricing, starts at $5/month, works on Android and desktop, keeps your image on your device, and gives every account 3 free sessions to try first. It is the easiest and most affordable way to start learning to draw with AR.</p>

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
    <p>Every account gets 3 free tracing sessions. Paid plans are $5/month, $10 per 3 months, or a one-time $15 lifetime plan (limited to 10 spots).</p>

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
        { '@type': 'Question', 'name': 'How much does it cost?', 'acceptedAnswer': { '@type': 'Answer', 'text': 'Every account gets 3 free sessions. Paid plans are $5/month, $10 per 3 months, or a one-time $15 lifetime plan limited to 10 spots.' } },
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

// Pricing structured data — Product/Offer derived from the SINGLE plan source
// (plans.js) so the schema can never drift from the visible page, plus the FAQ
// shown on /pricing. Injected into the prerendered /pricing head.
const PRICING_PRICES = VISIBLE_PLANS.map((p) => p.price);
const PRICING_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Product',
      name: 'TraceMate',
      description: 'Browser-based AR tracing app: see any image as a live overlay on real paper and trace it by hand. No app install.',
      brand: { '@type': 'Brand', name: 'TraceMate' },
      offers: {
        '@type': 'AggregateOffer',
        priceCurrency: 'USD',
        lowPrice: String(Math.min(...PRICING_PRICES).toFixed(2)),
        highPrice: String(Math.max(...PRICING_PRICES).toFixed(2)),
        offerCount: VISIBLE_PLANS.length,
        offers: VISIBLE_PLANS.map((p) => ({
          '@type': 'Offer', name: p.name, price: p.price.toFixed(2),
          priceCurrency: 'USD', availability: 'https://schema.org/InStock',
        })),
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        ['Will it work on my phone?', 'Yes — TraceMate runs in your browser on iPhone, Android, iPad, and desktop with a camera. There is nothing to install.'],
        ['Are my images private?', 'Your reference images stay on your device. We only store your account info (email and plan) — never your photos.'],
        ['What do the free sessions include?', 'Every new account gets 3 free tracing sessions with the full toolset, so you can try it before choosing a plan.'],
        ['Can I cancel anytime?', 'Yes. The monthly plan cancels anytime from your account in one click. Lifetime is a single one-time payment.'],
        ['Who charges my card?', 'Payments are handled securely by Dodo Payments, our Merchant of Record. The charge appears as “Dodo”, and a 14-day refund is available.'],
      ].map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    },
  ],
};

const ROUTES = [
  {
    path: '/welcome',
    title: 'Welcome to TraceMate — AR Tracing in Your Browser',
    description: 'New to TraceMate? Here is how AR tracing on real paper works: point your phone at paper, see any image as a live overlay, and trace it by hand. Browser-based — no app install.',
    // /welcome renders the same Landing as / — consolidate ranking on the root.
    canonical: `${SITE}/`,
  },
  {
    path: '/pricing',
    title: 'Pricing — TraceMate AR Tracing | $5/mo or $15 lifetime',
    description: 'TraceMate plans: $5/month or $15 one-time lifetime. Every new account gets 3 free tracing sessions. Cancel the monthly plan anytime. 14-day refund.',
    headExtra: `<script type="application/ld+json">${JSON.stringify(PRICING_JSONLD)}</script>`,
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

// ── Homepage body (/) ───────────────────────────────────────────────────────
// The SPA ships an empty <div id="root">, so non-JS crawlers (GPTBot, ClaudeBot,
// PerplexityBot, and Google's first HTML pass) saw NOTHING on the most-linked,
// highest-priority URL — and no internal links flowed to /draw, /how-to-use, or
// /pricing. This static body fixes both: a keyword-rich H1 + the four steps +
// internal links. React's createRoot() replaces it on mount, so humans still
// get the full interactive landing page.
const HOME_BODY = `
<main>
  <h1>Trace any image onto real paper with AR — the easy way to learn to draw</h1>
  <p>TraceMate turns your phone into an augmented-reality light box. Point your camera at paper, see any photo or drawing as a live overlay, and trace it by hand — no printing, no grid, no expensive light pad. It runs in your browser on iPhone, Android, iPad, and desktop, with nothing to install.</p>
  <h2>How it works — four easy steps</h2>
  <ol>
    <li>Upload or pick any image.</li>
    <li>Point your phone camera at your paper.</li>
    <li>See the outline overlaid on the page.</li>
    <li>Trace it by hand with your favorite tools.</li>
  </ol>
  <h2>Popular guides &amp; tutorials</h2>
  <ul>
    <li><a href="${SITE}/draw">How to draw anime characters with AR tracing</a></li>
    <li><a href="${SITE}/how-to-use">How to use TraceMate and get proportions right</a></li>
    <li><a href="${SITE}/pricing">Pricing — free sessions, then $5/mo or $15 lifetime</a></li>
  </ul>
  <p>Every new account includes free tracing sessions. <a href="${SITE}/upload">Start tracing now</a>.</p>
</main>`;

// ── "How to draw <character>" pages (data-driven from src/lib/characters.js) ──
// Mirrors src/pages/DrawCharacter.jsx so non-JS crawlers read the full tutorial.
// No copyrighted artwork — text-only tutorials that teach tracing-your-own-ref.
function characterBody(c) {
  const steps = charSteps(c).map((s) => `<li><strong>${esc(s.title)}.</strong> ${esc(s.text)}</li>`).join('');
  const tips = c.tips.map((t) => `<li>${esc(t)}</li>`).join('');
  const faqs = charFaqs(c).map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('');
  const related = getRelated(c.slug, 6)
    .map((r) => `<a href="${SITE}/draw/${r.slug}">How to draw ${esc(r.short)}</a>`).join(' · ');
  return `
<main>
  <article>
    <p>Draw ${esc(c.franchise)}</p>
    <h1>How to draw ${esc(c.name)}</h1>
    <p>${esc(charLead(c))}</p>
    <p><a href="${SITE}/upload">Start tracing free</a> · <a href="${SITE}/pricing">See pricing</a></p>
    <h2>Why trace ${esc(c.short)}?</h2>
    <p>${esc(charWhy(c))}</p>
    <h2>Trace ${esc(c.short)} in 5 steps</h2>
    <ol>${steps}</ol>
    <h2>Tips for drawing ${esc(c.short)}</h2>
    <ul>${tips}</ul>
    <h2>${esc(c.short)} — frequently asked questions</h2>
    ${faqs}
    <h2>More characters to draw</h2>
    <p>${related}</p>
  </article>
</main>`;
}

function characterJsonLd(c) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'HowTo',
        'name': `How to draw ${c.name}`,
        'description': charLead(c),
        'totalTime': 'PT5M',
        'tool': [
          { '@type': 'HowToTool', 'name': 'A phone or tablet with a camera' },
          { '@type': 'HowToTool', 'name': 'Paper and a pencil' },
          { '@type': 'HowToTool', 'name': `A ${c.short} reference image` },
        ],
        'step': charSteps(c).map((s) => ({ '@type': 'HowToStep', 'name': s.title, 'text': s.text })),
      },
      {
        '@type': 'FAQPage',
        'mainEntity': charFaqs(c).map((f) => ({
          '@type': 'Question', 'name': f.q,
          'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        'itemListElement': [
          { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': `${SITE}/` },
          { '@type': 'ListItem', 'position': 2, 'name': 'How to draw characters', 'item': `${SITE}/draw` },
          { '@type': 'ListItem', 'position': 3, 'name': `How to draw ${c.short}`, 'item': `${SITE}/draw/${c.slug}` },
        ],
      },
    ],
  };
}

// Hub index body + JSON-LD (ItemList of every character page).
const DRAW_INDEX_BODY = `
<main>
  <article>
    <p>Step-by-step tutorials</p>
    <h1>How to draw anime characters</h1>
    <p>Pick a character and learn to draw it the fast way — trace any reference straight onto real paper with TraceMate's AR overlay, then redraw it freehand. No app, no printing, 3 free sessions to try.</p>
    <p><a href="${SITE}/upload">Start tracing free</a> · <a href="${SITE}/how-to-use">Read the guide</a></p>
    <h2>Characters</h2>
    <ul>${CHARACTERS.map((c) => `<li><a href="${SITE}/draw/${c.slug}">How to draw ${esc(c.short)}</a> — ${esc(c.franchise)} · ${esc(c.difficulty)}</li>`).join('')}</ul>
  </article>
</main>`;

const DRAW_INDEX_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      'name': 'How to draw anime characters',
      'description': 'Step-by-step AR tracing tutorials for drawing popular anime characters with TraceMate.',
      'url': `${SITE}/draw`,
    },
    {
      '@type': 'ItemList',
      'itemListElement': CHARACTERS.map((c, i) => ({
        '@type': 'ListItem', 'position': i + 1,
        'name': `How to draw ${c.short}`, 'url': `${SITE}/draw/${c.slug}`,
      })),
    },
  ],
};

// Append the hub + one route per character.
ROUTES.push({
  path: '/draw',
  title: 'How to Draw Anime Characters — Easy AR Tracing Tutorials | TraceMate',
  description: 'Free step-by-step tutorials to draw popular anime characters — Gojo, Sukuna, Naruto, Goku, Luffy and more. Trace any reference onto real paper with TraceMate. No app, no printing.',
  bodyHtml: DRAW_INDEX_BODY,
  headExtra: `<script type="application/ld+json">${JSON.stringify(DRAW_INDEX_JSONLD)}</script>`,
});
for (const c of CHARACTERS) {
  ROUTES.push({
    path: `/draw/${c.slug}`,
    title: charTitle(c),
    description: charDescription(c),
    bodyHtml: characterBody(c),
    headExtra: `<script type="application/ld+json">${JSON.stringify(characterJsonLd(c))}</script>`,
  });
}

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
      () => `<div id="root"><div style="${SR_ONLY}">${route.bodyHtml}</div></div>`,
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

  // Homepage: inject the static body into the real dist/index.html so the
  // highest-priority URL is no longer an empty shell to crawlers. Done from the
  // pristine baseHtml AFTER the route loop, so per-route files stay unaffected.
  try {
    const homeOut = baseHtml.replace(
      /<div id="root">\s*<\/div>/i,
      () => `<div id="root"><div style="${SR_ONLY}">${HOME_BODY}</div></div>`,
    );
    await writeFile(indexPath, homeOut, 'utf8');
    console.log('[prerender] injected homepage body into dist/index.html');
  } catch (err) {
    console.error(`[prerender] homepage body injection skipped: ${err.message}`);
  }

  // Inject the character pages into the sitemap (dist/sitemap.xml is freshly
  // copied from public/ each build, so this never accumulates duplicates).
  try {
    const smPath = resolve(DIST, 'sitemap.xml');
    let sm = await readFile(smPath, 'utf8');
    const urls = [
      `  <url><loc>${SITE}/draw</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`,
      ...CHARACTERS.map((c) =>
        `  <url><loc>${SITE}/draw/${c.slug}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`),
    ].join('\n');
    const block = `\n  <!-- How-to-draw character tutorials (generated by prerender-routes.mjs) -->\n${urls}\n`;
    sm = sm.replace(/<\/urlset>\s*$/, `${block}\n</urlset>\n`);
    await writeFile(smPath, sm, 'utf8');
    console.log(`[prerender] added ${CHARACTERS.length + 1} character URLs to sitemap.xml`);
  } catch (err) {
    console.error(`[prerender] sitemap injection skipped: ${err.message}`);
  }
}

main().catch((err) => {
  console.error('[prerender] failed:', err);
  process.exit(1);
});
