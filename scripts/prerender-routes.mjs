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

const ROUTES = [
  {
    path: '/welcome',
    title: 'Welcome to TraceMate — AR Tracing in Your Browser',
    description: 'New to TraceMate? Here is how AR tracing on real paper works: point your phone at paper, see any image as a live overlay, and trace it by hand. Browser-based — no app install.',
  },
  {
    path: '/pricing',
    title: 'Pricing — TraceMate AR Tracing | $5/mo or $15 lifetime',
    description: 'TraceMate plans: $5/month, $10/3-months, or $15 one-time lifetime (10 spots). Every new account gets one free tracing session. Cancel anytime on monthly and 3-month plans.',
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
  let out = html;

  // <title>
  out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${route.title}</title>`);

  // <meta name="description">
  out = setAttr(out, /<meta\s+name="description"[^>]*>/i, 'content', route.description);

  // Canonical
  out = setAttr(out, /<link\s+rel="canonical"[^>]*>/i, 'href', url);

  // Open Graph
  out = setAttr(out, /<meta\s+property="og:title"[^>]*>/i, 'content', route.title);
  out = setAttr(out, /<meta\s+property="og:description"[^>]*>/i, 'content', route.description);
  out = setAttr(out, /<meta\s+property="og:url"[^>]*>/i, 'content', url);

  // Twitter
  out = setAttr(out, /<meta\s+name="twitter:title"[^>]*>/i, 'content', route.title);
  out = setAttr(out, /<meta\s+name="twitter:description"[^>]*>/i, 'content', route.description);

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
