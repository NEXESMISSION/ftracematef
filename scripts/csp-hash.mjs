// Recompute SHA-256 hashes for inline <script> blocks in index.html and
// verify them against the CSP `script-src` value in public/_headers. Run
// after editing the JSON-LD block (or any other inline script we ever add)
// so the CSP doesn't silently start blocking SEO content in production.
//
// Usage:  node scripts/csp-hash.mjs           # verify; exits 1 on mismatch
//         node scripts/csp-hash.mjs --print   # just print the hashes
//
// Why this matters: public/_headers pins `script-src` to the exact hashes of
// our inline scripts (no `'unsafe-inline'`). If a contributor edits the
// JSON-LD block and forgets to refresh the CSP, search engines will still
// see the content (it's in the HTML) but browsers will block it from
// executing — which is mostly fine for crawlers, but means any future
// JS-driven inline script silently breaks. Keep this script in CI /
// pre-deploy.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const html    = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const headers = readFileSync(resolve(ROOT, 'public/_headers'), 'utf8');

const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const hashes = [];
let m;
while ((m = re.exec(html))) {
  const body = m[1];
  if (!body.trim()) continue;
  const h = createHash('sha256').update(body).digest('base64');
  hashes.push(`sha256-${h}`);
}

if (process.argv.includes('--print')) {
  for (const h of hashes) console.log(h);
  process.exit(0);
}

const missing = hashes.filter((h) => !headers.includes(h));
if (missing.length) {
  console.error('CSP hash drift — public/_headers is missing:');
  for (const h of missing) console.error(`  '${h}'`);
  console.error('\nUpdate the script-src directive in public/_headers.');
  process.exit(1);
}
console.log(`CSP hashes ok (${hashes.length} inline script${hashes.length === 1 ? '' : 's'}).`);
