// Stamp dist/version.json with a build identifier the running tab can
// poll to detect a fresh deploy. Lives outside public/ on purpose —
// writing into public/ would pollute git on every dev build.
//
// Resolution order for the build id:
//   1. Cloudflare Pages / Netlify env (CF_PAGES_COMMIT_SHA, COMMIT_REF)
//   2. `git rev-parse --short HEAD`
//   3. ISO timestamp fallback (still monotonic per-build)

import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, '..', 'dist');

function resolveBuildId() {
  const ci = process.env.CF_PAGES_COMMIT_SHA || process.env.COMMIT_REF || process.env.VERCEL_GIT_COMMIT_SHA;
  if (ci) return ci.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
  } catch {
    return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  }
}

const build = resolveBuildId();
const builtAt = new Date().toISOString();

await mkdir(DIST, { recursive: true });
await writeFile(
  resolve(DIST, 'version.json'),
  JSON.stringify({ build, builtAt }, null, 2) + '\n',
  'utf8',
);

console.log(`[version] dist/version.json → ${build} (${builtAt})`);
