// WebP quality comparison — converts heaviest images at 5 quality levels
// so you can eyeball where it starts looking bad.
//
// Usage:  node scripts/webp-test.mjs
// Output: writes public/_webp-test/q{N}/<original-path>.webp

import sharp from 'sharp';
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const ROOT = 'public/images';
const OUT  = 'public/_webp-test';

const QUALITIES = [85, 75, 65, 55, 45];

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, files);
    else if (entry.name.endsWith('.png')) files.push(p);
  }
  return files;
}

async function fileSize(p) {
  return (await stat(p)).size;
}

const allFiles = await walk(ROOT);

console.log(`\n— scanning ${allFiles.length} png files\n`);

// Sort by size, pick top 4 heaviest for the visual quality test
const sized = await Promise.all(
  allFiles.map(async (p) => ({ path: p, size: await fileSize(p) }))
);
sized.sort((a, b) => b.size - a.size);

const samples = sized.slice(0, 4);

console.log('— sample images (heaviest 4):\n');
for (const f of samples) {
  console.log(`  ${(f.size / 1024).toFixed(0).padStart(4)} KB   ${f.path}`);
}
console.log('');

// Convert just the samples at every quality
console.log('— writing WebP samples at multiple quality levels...\n');
console.log('quality |  original |   webp   |  saved');
console.log('--------+-----------+----------+--------');

for (const q of QUALITIES) {
  const qDir = join(OUT, `q${q}`);
  let totalIn = 0, totalOut = 0;

  for (const f of samples) {
    const rel = f.path.slice(ROOT.length + 1);          // e.g. "welcome/welcome-2.png"
    const outPath = join(qDir, rel.replace(/\.png$/, '.webp'));
    await mkdir(dirname(outPath), { recursive: true });

    await sharp(f.path)
      .webp({ quality: q, effort: 6 })
      .toFile(outPath);

    const outSize = await fileSize(outPath);
    totalIn  += f.size;
    totalOut += outSize;
  }

  const savedPct = (1 - totalOut / totalIn) * 100;
  console.log(
    ` q=${q.toString().padStart(2)}    |  ${(totalIn / 1024).toFixed(0).padStart(4)} KB  |  ${(totalOut / 1024).toFixed(0).padStart(4)} KB |  ${savedPct.toFixed(0)}%`
  );
}

console.log(`\n✓ test files written to ${OUT}/q{quality}/`);
console.log('  → open each folder and visually compare against the originals.\n');
