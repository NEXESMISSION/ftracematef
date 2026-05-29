// In-browser screen recorder for the trace studio.
//
// Every recording is composited onto an offscreen canvas at viewport size,
// then captureStream'd — audio is reused from the source stream so we don't
// double-prompt the mic. The `mode` flag only controls whether the reference
// overlay is drawn on top of the camera feed:
//   - 'camera':    camera feed only (overlay hidden).
//   - 'composite': camera feed + the reference overlay, matching what's on
//                  screen.
// Both paths run through the canvas so the tracemate watermark is burned into
// the bottom-right of every exported clip regardless of overlay choice.
//
// 100% client-side. No fetch, no upload, no Supabase. The output blob is
// turned into an object URL and offered as a download — nothing leaves the
// device unless the user shares the file themselves.
//
// Codec preference favours the format each browser actually accepts:
// Safari/iOS only encodes mp4, while Chrome/Firefox prefer webm/vp9. We
// probe MediaRecorder.isTypeSupported and pick the best match.

const MIME_PRIORITIES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const m of MIME_PRIORITIES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch { /* some browsers throw on unknown codecs */ }
  }
  return null;
}

export function isRecordingSupported() {
  return pickMimeType() != null;
}

// Burn a "tracemate" wordmark into the bottom-right corner of every frame.
// Sized off the canvas width so it scales with resolution, drawn with a soft
// shadow so it stays legible over both light and dark camera feeds. Cheap
// enough to run per-frame (one fillText + a dot).
function drawWatermark(ctx, w, h, dpr) {
  const fontPx = Math.max(14 * dpr, Math.round(w * 0.028));
  const pad = Math.round(12 * dpr);
  ctx.save();
  ctx.font = `700 ${fontPx}px Nunito, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = Math.round(4 * dpr);
  ctx.shadowOffsetY = Math.round(1 * dpr);
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('tracemate', w - pad, h - pad);
  // Small coral accent dot before the wordmark, matching the brand mark.
  const textW = ctx.measureText('tracemate').width;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#e87a7a';
  const dotR = Math.max(2 * dpr, fontPx * 0.12);
  ctx.beginPath();
  ctx.arc(w - pad - textW - dotR * 2.2, h - pad - fontPx * 0.32, dotR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 250);
}

// opts:
//   mode:           'camera' | 'composite'
//   sourceStream:   the live MediaStream from getUserMedia (always required —
//                   used directly in 'camera' mode, used for audio in
//                   'composite' mode).
//   videoEl:        <video> element rendering the camera feed (composite only).
//   overlayEl:      <img> element rendering the reference overlay (composite only).
//   getOverlayState: () => { x, y, scale, rotation, flip, opacity } — read each
//                   frame so live transforms during recording are captured.
//   onSaved:        optional () => void — fired once a non-empty clip has been
//                   downloaded, so callers can record that this session
//                   produced a saved result.
export function startRecording(opts) {
  const mime = pickMimeType();
  if (!mime) throw new Error('Recording is not supported in this browser.');
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';

  const cleanups = [];
  let recordStream = null;

  {
    const { videoEl, overlayEl, getOverlayState, sourceStream } = opts;
    if (!videoEl) throw new Error('Recording needs a video element.');
    const drawOverlay = opts.mode !== 'camera';

    // Record at viewport size so the result matches what the user sees on
    // screen. Cap at a reasonable resolution to keep encoder load sane on
    // older phones.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(1920, Math.round(window.innerWidth * dpr));
    const h = Math.min(1920, Math.round(window.innerHeight * dpr));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    let rafId = 0;
    const tick = () => {
      // Camera feed with object-fit: cover semantics (matches the .trace-video CSS).
      const vw = videoEl.videoWidth;
      const vh = videoEl.videoHeight;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      if (vw && vh) {
        const scale = Math.max(w / vw, h / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.drawImage(videoEl, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }

      // Overlay drawn with the same translate/scale/rotate/flip stack as the
      // CSS transform on .trace-overlay-img. We deliberately ignore matrix3d
      // perspective warp here — replicating it on a 2D canvas needs WebGL,
      // and most users record without warp on. The overlay still renders;
      // it just won't show the corner-pull distortion in the file.
      const ow = overlayEl?.offsetWidth || 0;
      const oh = overlayEl?.offsetHeight || 0;
      if (drawOverlay && overlayEl && ow && oh && overlayEl.complete) {
        const s = getOverlayState();
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, s.opacity));
        ctx.translate(w / 2 + s.x * dpr, h / 2 + s.y * dpr);
        ctx.rotate((s.rotation * Math.PI) / 180);
        ctx.scale(s.flip ? -s.scale : s.scale, s.scale);
        ctx.drawImage(overlayEl, -ow * dpr / 2, -oh * dpr / 2, ow * dpr, oh * dpr);
        ctx.restore();
      }

      drawWatermark(ctx, w, h, dpr);

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    cleanups.push(() => cancelAnimationFrame(rafId));

    const canvasStream = canvas.captureStream(30);
    const audioTracks = sourceStream?.getAudioTracks?.() || [];
    recordStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks,
    ]);
  }

  const recorder = new MediaRecorder(recordStream, { mimeType: mime });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  let stopResolve = null;
  const stopped = new Promise((res) => { stopResolve = res; });
  recorder.onstop = () => {
    cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
    const blob = new Blob(chunks, { type: mime });
    if (blob.size > 0) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      triggerDownload(blob, `tracemate-${ts}.${ext}`);
      try { opts.onSaved?.(); } catch { /* caller-side bookkeeping, never fatal */ }
    }
    stopResolve();
  };

  // Timeslice keeps memory bounded for long takes — chunks flush every second
  // instead of buffering the whole recording in RAM until stop.
  recorder.start(1000);

  return {
    stop() {
      if (recorder.state !== 'inactive') {
        try { recorder.stop(); } catch { /* ignore */ }
      } else {
        stopResolve();
      }
      return stopped;
    },
  };
}
