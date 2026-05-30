// On-device background remover — zero dependencies, runs entirely in a canvas.
//
// Strategy: flood-fill inward from the image border, clearing every pixel that
// stays within a colour tolerance of the sampled background. Because removal
// only propagates through pixels CONNECTED to the edge, a subject that happens
// to contain the background colour internally (e.g. a white shirt on a white
// backdrop) keeps its interior — only the surrounding background is cut.
//
// This nails the cases a tracing app actually sees most: line art / sketches
// on paper, clip art, logos, stickers, and product shots on a flat backdrop.
// It is NOT a neural matting model — busy photographic backgrounds won't cut
// cleanly. We surface that expectation in the UI ("works best on solid
// backgrounds") rather than shipping a 40 MB WASM model.
//
// Output is a PNG (alpha preserved) as both a Blob and an object URL.

// Cap the working resolution so a 24-megapixel upload doesn't allocate a
// half-gig of pixel buffers. 2400px on the long edge is plenty for an overlay
// reference and keeps the flood fill well under ~100ms on a phone.
const MAX_DIM = 2400;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e instanceof Error ? e : new Error('Image failed to load'));
    img.src = src;
  });
}

/**
 * Remove the background from an image.
 *
 * @param {string} src        - object URL or data URL of the source image
 * @param {object} [opts]
 * @param {number} [opts.tolerance=42] - 0..~180 colour distance; higher removes more
 * @returns {Promise<{ blob: Blob, url: string, width: number, height: number }>}
 */
export async function removeBackground(src, { tolerance = 42 } = {}) {
  const img = await loadImage(src);

  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) throw new Error('Could not read image dimensions');

  const scale = Math.min(1, MAX_DIM / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, w, h);

  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data; // RGBA, length w*h*4

  // Reference background colour = average of the four corners. Corners are the
  // safest "this is definitely background" sample for a framed reference.
  const cornerIdx = [
    0,                       // top-left
    (w - 1) * 4,             // top-right
    (h - 1) * w * 4,         // bottom-left
    ((h - 1) * w + (w - 1)) * 4, // bottom-right
  ];
  let br = 0, bg = 0, bb = 0;
  for (const i of cornerIdx) { br += data[i]; bg += data[i + 1]; bb += data[i + 2]; }
  br /= 4; bg /= 4; bb /= 4;

  const tol2 = tolerance * tolerance;
  const near = (i) => {
    const dr = data[i] - br;
    const dg = data[i + 1] - bg;
    const db = data[i + 2] - bb;
    return (dr * dr + dg * dg + db * db) <= tol2;
  };

  // Iterative flood fill from every border pixel. `visited` doubles as the
  // "is this pixel cleared" mask. Typed arrays + a flat numeric stack keep it
  // allocation-light and fast even on multi-megapixel images.
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let sp = 0;
  const pushIf = (px) => {
    if (px < 0 || px >= w * h) return;
    if (visited[px]) return;
    if (!near(px * 4)) return;
    visited[px] = 1;
    stack[sp++] = px;
  };

  // Seed the whole border.
  for (let x = 0; x < w; x++) { pushIf(x); pushIf((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { pushIf(y * w); pushIf(y * w + (w - 1)); }

  while (sp > 0) {
    const px = stack[--sp];
    const x = px % w;
    const y = (px - x) / w;
    if (x > 0)     pushIf(px - 1);
    if (x < w - 1) pushIf(px + 1);
    if (y > 0)     pushIf(px - w);
    if (y < h - 1) pushIf(px + w);
  }

  // Apply the mask: cleared pixels → fully transparent. Then a light 1px edge
  // feather: a kept pixel touching a cleared one gets partial alpha so the
  // cutout doesn't have a hard, aliased fringe.
  for (let px = 0; px < w * h; px++) {
    if (visited[px]) {
      data[px * 4 + 3] = 0;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = y * w + x;
      if (visited[px]) continue;
      // Count cleared 4-neighbours.
      let cleared = 0;
      if (x > 0 && visited[px - 1]) cleared++;
      if (x < w - 1 && visited[px + 1]) cleared++;
      if (y > 0 && visited[px - w]) cleared++;
      if (y < h - 1 && visited[px + w]) cleared++;
      if (cleared > 0) {
        // 1 neighbour → ~75% alpha, 3+ → ~25%. Softens the boundary.
        const a = data[px * 4 + 3];
        data[px * 4 + 3] = Math.round(a * (1 - 0.25 * cleared));
      }
    }
  }

  ctx.putImageData(image, 0, 0);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not encode PNG'))),
      'image/png',
    );
  });
  const url = URL.createObjectURL(blob);
  return { blob, url, width: w, height: h };
}
