// Generate Capacitor asset sources from public/icon-*.png.
// Outputs into ./assets so `npx capacitor-assets generate` can produce
// every Android density.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'assets');
await mkdir(outDir, { recursive: true });

const SRC_SQUARE = resolve(root, 'public/icon-512-square.png');
const SRC_MASKABLE = resolve(root, 'public/icon-maskable-512.png');
const BG = '#FFF8EF';

// 1024x1024 full-bleed icon — Capacitor-Assets uses this for legacy round icons.
await sharp(SRC_SQUARE).resize(1024, 1024, { fit: 'cover' }).png()
  .toFile(resolve(outDir, 'icon-only.png'));

// Adaptive-icon background — solid brand cream.
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: BG },
}).png().toFile(resolve(outDir, 'icon-background.png'));

// Adaptive-icon foreground — must have ~25% safe-zone margin around the
// glyph (Android crops corners). We center the 512 maskable into 1024.
const fg = await sharp(SRC_MASKABLE).resize(640, 640, { fit: 'contain' }).toBuffer();
await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([{ input: fg, gravity: 'center' }])
  .png()
  .toFile(resolve(outDir, 'icon-foreground.png'));

// Splash — 2732x2732 with brand bg + centered logo.
const splashLogo = await sharp(SRC_SQUARE).resize(720, 720, { fit: 'contain' }).toBuffer();
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG },
})
  .composite([{ input: splashLogo, gravity: 'center' }])
  .png()
  .toFile(resolve(outDir, 'splash.png'));

// Dark splash — same, since brand is light-only. Capacitor-Assets needs the file.
await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: BG },
})
  .composite([{ input: splashLogo, gravity: 'center' }])
  .png()
  .toFile(resolve(outDir, 'splash-dark.png'));

console.log('Capacitor asset sources written to', outDir);
