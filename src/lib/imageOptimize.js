/**
 * Client-side image optimization (D1).
 *
 * Downscale large images and re-encode them to a compact format (WebP where
 * supported) before we store, persist, or upload them. Keeps the trace overlay
 * and the result feed crisp enough while slashing byte size — which:
 *   - lets big phone photos fit the ~4.5MB sessionStorage cap (pendingImage),
 *   - makes the overlay load fast,
 *   - keeps storage/bandwidth cheap once the publish feed (C2) ships.
 *
 * Pure browser canvas — no dependencies. Every helper fails soft: callers get
 * the original back rather than an exception breaking the flow.
 */

const FULL_MAX_DIM = 2048;   // longest edge for a full-size image
const FULL_QUALITY = 0.9;    // higher quality so traced line-art stays crisp
const THUMB_MAX_DIM = 512;   // longest edge for grid/feed thumbnails
const THUMB_QUALITY = 0.82;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

// Cache the one-time WebP-encode capability check.
let _webp;
function supportsWebp() {
  if (_webp === undefined) {
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      _webp = c.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      _webp = false;
    }
  }
  return _webp;
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = (head.match(/data:(.*?);/) || [, 'image/png'])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => resolve(b || dataUrlToBlob(canvas.toDataURL(type, quality))), type, quality);
    } else {
      resolve(dataUrlToBlob(canvas.toDataURL(type, quality)));
    }
  });
}

function srcLikelyHasAlpha(input) {
  const t = typeof input === 'string'
    ? (input.match(/^data:(image\/[a-z+]+)/i)?.[1] || '')
    : (input?.type || '');
  return /png|webp|gif/i.test(t);
}

/**
 * Optimize an image. `input` may be a File, Blob, or URL / data URL.
 * Returns { file, url, width, height, bytes } — `file` is the re-encoded,
 * downscaled copy and `url` is a fresh object URL the caller is responsible
 * for revoking. WebP is used when the browser can encode it (keeps alpha and
 * is the smallest); otherwise PNG for images that may have transparency and
 * JPEG for everything else.
 */
export async function optimizeImage(input, opts = {}) {
  const maxDim = opts.maxDim ?? FULL_MAX_DIM;
  const quality = opts.quality ?? FULL_QUALITY;

  const isUrl = typeof input === 'string';
  const srcUrl = isUrl ? input : URL.createObjectURL(input);
  const baseName = (!isUrl && input?.name ? input.name : 'image').replace(/\.[^.]+$/, '') || 'image';

  try {
    const img = await loadImage(srcUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('zero-size image');

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    // Sharpness-preserving downscale: a single big canvas.drawImage step
    // aliases hard edges (the worst case for line-art). Instead halve the
    // image repeatedly (each ≤2x step is what the browser resamples best),
    // then do the final exact step. Keeps thin outlines clean at small sizes.
    let srcCanvas = document.createElement('canvas');
    srcCanvas.width = w;
    srcCanvas.height = h;
    let sctx = srcCanvas.getContext('2d');
    sctx.drawImage(img, 0, 0);

    let cw = w, ch = h;
    while (cw > tw * 2 && ch > th * 2) {
      const nw = Math.max(tw, Math.round(cw / 2));
      const nh = Math.max(th, Math.round(ch / 2));
      const step = document.createElement('canvas');
      step.width = nw;
      step.height = nh;
      const stepCtx = step.getContext('2d');
      stepCtx.imageSmoothingEnabled = true;
      stepCtx.imageSmoothingQuality = 'high';
      stepCtx.drawImage(srcCanvas, 0, 0, cw, ch, 0, 0, nw, nh);
      srcCanvas = step;
      sctx = stepCtx;
      cw = nw; ch = nh;
    }

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, cw, ch, 0, 0, tw, th);

    let type;
    if (supportsWebp()) type = 'image/webp';
    else type = srcLikelyHasAlpha(input) ? 'image/png' : 'image/jpeg';

    const blob = await canvasToBlob(canvas, type, quality);
    if (!blob) throw new Error('encode failed');

    const ext = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
    const file = new File([blob], `${baseName}.${ext}`, { type });
    return { file, url: URL.createObjectURL(file), width: tw, height: th, bytes: blob.size };
  } finally {
    if (!isUrl) URL.revokeObjectURL(srcUrl);
  }
}

/** Small thumbnail for grids / feeds. Same encoding rules as optimizeImage. */
export function makeThumbnail(input, opts = {}) {
  return optimizeImage(input, {
    maxDim: opts.maxDim ?? THUMB_MAX_DIM,
    quality: opts.quality ?? THUMB_QUALITY,
  });
}
