/**
 * Watermark helpers (A2). Shared by the recorder (per-frame, on the composite
 * canvas) and — once it ships — the publish/result flow (C2, still images).
 *
 * The mark reads "Trace Mate · tracemate.art", bottom-right, white with a dark
 * shadow so it stays legible over any background. Free users get the mark;
 * paid users can turn it off (the caller decides and simply skips these).
 */

const BRAND = 'Trace Mate';
const DOMAIN = 'tracemate.art';

/**
 * Stamp the watermark directly onto a 2D canvas context. Used by the recorder
 * each frame. `width`/`height` are the canvas pixel dimensions.
 */
export function drawWatermark(ctx, width, height) {
  if (!ctx || !width || !height) return;

  // Scale the mark to the output so it reads the same on a phone clip or a
  // big canvas. Clamp so it never gets silly-small or huge.
  const base = Math.min(width, height);
  const fontSize = Math.max(13, Math.round(base * 0.032));
  const pad = Math.round(fontSize * 0.9);
  const gap = Math.round(fontSize * 0.18);

  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.22));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  const x = width - pad;
  const domainY = height - pad;

  // Domain (smaller, lighter) on the bottom line.
  const domainSize = Math.round(fontSize * 0.78);
  ctx.font = `600 ${domainSize}px Nunito, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.fillText(DOMAIN, x, domainY);

  // Brand (larger, bolder) on the line above.
  ctx.font = `800 ${fontSize}px Nunito, system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(BRAND, x, domainY - domainSize - gap);

  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), type, quality);
    else resolve(null);
  });
}

/**
 * Return a watermarked copy of a still image (File / Blob / URL). For the
 * publish/result flow (C2). Returns { file, url } or the original on failure.
 * Pass { enabled: false } to skip the mark (paid users) — returns a plain
 * re-encoded copy so callers can treat the output uniformly.
 */
export async function watermarkImage(input, opts = {}) {
  const { enabled = true, type = 'image/webp', quality = 0.85 } = opts;
  const isUrl = typeof input === 'string';
  const srcUrl = isUrl ? input : URL.createObjectURL(input);
  const baseName = (!isUrl && input?.name ? input.name : 'tracemate').replace(/\.[^.]+$/, '') || 'tracemate';
  try {
    const img = await loadImage(srcUrl);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    if (enabled) drawWatermark(ctx, w, h);
    const useType = canvasToBlob && type ? type : 'image/png';
    const blob = await canvasToBlob(canvas, useType, quality);
    if (!blob) throw new Error('encode failed');
    const ext = useType === 'image/webp' ? 'webp' : useType === 'image/png' ? 'png' : 'jpg';
    const file = new File([blob], `${baseName}.${ext}`, { type: useType });
    return { file, url: URL.createObjectURL(file), width: w, height: h, bytes: blob.size };
  } finally {
    if (!isUrl) URL.revokeObjectURL(srcUrl);
  }
}
