// Synchronous-ish helper: load an image source (data URL, blob URL, or http
// URL with CORS) into an <img>, resize via canvas, and return a JPEG data
// URL bounded by `maxDim` on the longer side.
//
// Used by /trace to produce a small thumbnail of the reference image to
// ship over the WebRTC data channel into the admin spectator modal — see
// lib/livePreview.js (extras data channel) and pages/AdminDashboard.jsx
// (SpectateModal). A 640px JPEG at quality 0.85 is typically 30-80 KB,
// which fits in a single data-channel message everywhere we care about.

export function downscaleToDataUrl(src, maxDim = 640, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!src) { reject(new Error('downscaleToDataUrl: no src')); return; }
    const img = new Image();
    // crossOrigin lets us pull from http(s) URLs without tainting the
    // canvas. Same-origin / data: / blob: URLs ignore this; cross-origin
    // sources need the server to send Access-Control-Allow-Origin. In
    // practice /trace only uses blob: + data: URLs so this is belt-and-
    // braces for any future code that points us at a remote image.
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const w0 = img.naturalWidth  || img.width;
        const h0 = img.naturalHeight || img.height;
        if (!w0 || !h0) { reject(new Error('downscaleToDataUrl: empty image')); return; }
        const scale = Math.min(1, maxDim / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * scale));
        const h = Math.max(1, Math.round(h0 * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) { reject(new Error('downscaleToDataUrl: 2d context failed')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        // JPEG keeps the payload small; tracing references rarely need
        // alpha. If we ever support PNGs with transparency we can switch
        // to 'image/webp' here for a free 20-30% size win.
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('downscaleToDataUrl: image load failed'));
    img.src = src;
  });
}
