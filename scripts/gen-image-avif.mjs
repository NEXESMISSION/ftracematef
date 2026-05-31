// Generate AVIF twins + a dimensions manifest for every static image under
// public/images, so the landing page can serve AVIF (smallest) with a WebP
// fallback and set explicit width/height (zero layout shift).
//
// Idempotent + incremental: skips an AVIF that's already newer than its source.
// Runs as part of `npm run build` (before vite build). Safe to run anytime.
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve('public/images');
const MANIFEST = path.resolve('src/lib/imageManifest.json');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

const isSrc = (f) => /\.(webp|png|jpe?g)$/i.test(f) && !/\.avif$/i.test(f);

async function main() {
  if (!existsSync(ROOT)) { console.log('[avif] no public/images, skipping'); return; }
  const files = (await walk(ROOT)).filter(isSrc);

  // Prefer the .webp of each basename as the canonical source (smaller than png).
  // Group by dir+basename so a foo.png + foo.webp pair only encodes once.
  const byKey = new Map();
  for (const f of files) {
    const key = f.replace(/\.(webp|png|jpe?g)$/i, '');
    const cur = byKey.get(key);
    const rank = (p) => (/\.webp$/i.test(p) ? 0 : /\.png$/i.test(p) ? 1 : 2);
    if (!cur || rank(f) < rank(cur)) byKey.set(key, f);
  }

  const manifest = {};
  let made = 0;
  for (const [key, src] of byKey) {
    const avif = `${key}.avif`;
    const rel = '/' + path.relative(path.resolve('public'), src).replace(/\\/g, '/');
    const relNoExt = rel.replace(/\.(webp|png|jpe?g)$/i, '');

    let meta;
    try { meta = await sharp(src).metadata(); } catch { continue; }
    manifest[relNoExt] = { w: meta.width || null, h: meta.height || null };

    // Skip if a fresh AVIF already exists.
    if (existsSync(avif)) {
      const [a, s] = await Promise.all([stat(avif), stat(src)]);
      if (a.mtimeMs >= s.mtimeMs) continue;
    }
    try {
      await sharp(src).avif({ quality: 52, effort: 4 }).toFile(avif);
      made += 1;
    } catch (e) {
      console.warn('[avif] failed', src, e.message);
    }
  }

  // Only rewrite the manifest if it changed (keeps git/HMR quiet).
  const next = JSON.stringify(manifest, null, 2) + '\n';
  let prev = '';
  try { prev = await readFile(MANIFEST, 'utf8'); } catch { /* first run */ }
  if (prev !== next) await writeFile(MANIFEST, next);

  console.log(`[avif] ${made} encoded, ${Object.keys(manifest).length} images in manifest`);
}

main().catch((e) => { console.error('[avif]', e); process.exit(0); /* never block build */ });
