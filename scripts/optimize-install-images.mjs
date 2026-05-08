// One-shot image optimizer for the install-modal step screenshots and the
// store-button artwork. Resizes each source to a sensible display width
// and writes a WebP at quality 80 — typically 4-6× smaller than the JPEG
// source while staying visually indistinguishable at the displayed size.
//
// Run from repo root with `node app/scripts/optimize-install-images.mjs`.
// Idempotent — safe to re-run after dropping new source files in.

import { readdir, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import sharp from 'sharp';

const ROOT      = join(import.meta.dirname, '..', '..');
const APP_DIR   = join(import.meta.dirname, '..');
const SRC_BASE  = join(ROOT, 'JPEG');
const DEST_INST = join(APP_DIR, 'public', 'images', 'install');
const DEST_BTN  = join(APP_DIR, 'public', 'images', 'store');

const INSTALL_WIDTH = 600;   // 2× of typical 300px display
const BUTTON_WIDTH  = 800;   // store buttons can render up to ~400px wide
const QUALITY       = 80;

async function ensureDir(p) {
  if (!existsSync(p)) await mkdir(p, { recursive: true });
}

async function optimizeFile(src, dest, width) {
  const before = (await stat(src)).size;
  await sharp(src)
    .rotate()                              // honour EXIF orientation
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(dest);
  const after = (await stat(dest)).size;
  const pct = Math.round((1 - after / before) * 100);
  console.log(
    `  ${basename(src).padEnd(20)} ${(before/1024).toFixed(0).padStart(4)}KB → ` +
    `${basename(dest).padEnd(28)} ${(after/1024).toFixed(0).padStart(4)}KB  (-${pct}%)`,
  );
}

async function processInstallSteps(platform) {
  const dir = join(SRC_BASE, platform);
  if (!existsSync(dir)) return;
  const files = (await readdir(dir))
    .filter((f) => /^\d+\.(jpe?g|png)$/i.test(f))
    .sort();
  console.log(`\nInstall steps · ${platform} (${files.length} files)`);
  for (const f of files) {
    const stepNum = parseInt(f, 10);
    const src     = join(dir, f);
    const dest    = join(DEST_INST, `${platform}-step-${stepNum}.webp`);
    await optimizeFile(src, dest, INSTALL_WIDTH);
  }
}

async function processButton(srcName, destName) {
  const src = join(ROOT, srcName);
  if (!existsSync(src)) {
    console.log(`  (skipped — ${srcName} not found)`);
    return;
  }
  const dest = join(DEST_BTN, destName);
  await optimizeFile(src, dest, BUTTON_WIDTH);
}

async function main() {
  await ensureDir(DEST_INST);
  await ensureDir(DEST_BTN);

  await processInstallSteps('ios');
  await processInstallSteps('android');

  console.log('\nStore buttons');
  await processButton('ios button.png',     'ios.webp');
  await processButton('android button.png', 'android.webp');

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
