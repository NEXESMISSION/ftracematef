// Full WebP conversion at a chosen quality level.
// Generates .webp versions alongside the original .png files (originals are kept).
//
// Usage:  node scripts/webp-convert.mjs [quality]
//   default quality = 65

import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT    = 'public/images';
const QUALITY = Number(process.argv[2]) || 65;

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, files);
    else if (entry.name.endsWith('.png')) files.push(p);
  }
  return files;
}
async function fileSize(p) { return (await stat(p)).size; }

const files = await walk(ROOT);

console.log(`\n— converting ${files.length} png → webp at quality=${QUALITY}\n`);
console.log('   png   →  webp   |  saved  |  file');
console.log('---------+---------+---------+---------------------------------------------');

let totalIn = 0, totalOut = 0;

for (const inPath of files) {
  const outPath = inPath.replace(/\.png$/, '.webp');
  await sharp(inPath).webp({ quality: QUALITY, effort: 6 }).toFile(outPath);
  const inSize  = await fileSize(inPath);
  const outSize = await fileSize(outPath);
  totalIn += inSize;
  totalOut += outSize;
  const savedPct = (1 - outSize / inSize) * 100;
  console.log(
    ` ${(inSize / 1024).toFixed(0).padStart(5)} KB → ${(outSize / 1024).toFixed(0).padStart(5)} KB | ${savedPct.toFixed(0).padStart(5)}%  |  ${inPath}`
  );
}

console.log('---------+---------+---------+---------------------------------------------');
const totalPct = (1 - totalOut / totalIn) * 100;
console.log(
  ` ${(totalIn / 1024).toFixed(0).padStart(5)} KB → ${(totalOut / 1024).toFixed(0).padStart(5)} KB | ${totalPct.toFixed(0).padStart(5)}%  |  TOTAL  (${(totalIn/1024/1024).toFixed(2)} MB → ${(totalOut/1024/1024).toFixed(2)} MB)`
);

console.log(`\n✓ webp files written next to the .png originals (originals kept).\n`);
