import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useLocalState } from '../lib/useLocalState.js';
import { startBroadcaster, startViewer } from '../lib/livePreview.js';

const STATUS_LABEL = {
  idle:         'Idle',
  starting:     'Starting…',
  waiting:      'Waiting for the other device…',
  connecting:   'Connecting…',
  reconnecting: 'Reconnecting…',
  connected:    'Connected',
  disconnected: 'Disconnected',
};

const INITIAL_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, flip: false };

const statusTone = (s) =>
  s === 'connected' ? 'good' : s === 'disconnected' ? 'bad' : 'wait';

/* ─────────────────────────── Role picker ─────────────────────────── */

function RolePicker({ onPick }) {
  return (
    <div className="live-shell">
      <header className="live-bar">
        <Link to="/account" className="live-back" aria-label="Back to account">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3 L4 8 L10 13 M4 8 H14" />
          </svg>
          <span>Account</span>
        </Link>
        <h1 className="live-title">Live Preview</h1>
        <span className="live-spacer" aria-hidden="true" />
      </header>

      <main className="live-picker">
        <p className="live-picker-sub">
          Open Trace Mate on both devices and sign into the same account. Pick a role on each.
        </p>

        <div className="live-roles">
          <button type="button" className="live-role-card" onClick={() => onPick('broadcaster')}>
            <span className="live-role-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7 H7 L9 5 H15 L17 7 H21 a1 1 0 0 1 1 1 V18 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V8 a1 1 0 0 1 1 -1 Z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <span className="live-role-name">Broadcast</span>
            <span className="live-role-desc">Camera + your trace overlay</span>
          </button>

          <button type="button" className="live-role-card" onClick={() => onPick('viewer')}>
            <span className="live-role-icon" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="13" rx="2" />
                <path d="M10 9 L15 11.5 L10 14 Z" fill="currentColor" />
              </svg>
            </span>
            <span className="live-role-name">View</span>
            <span className="live-role-desc">Watch the broadcasting device</span>
          </button>
        </div>

        <p className="live-picker-foot">
          Video streams directly between your two devices. It never touches our servers.
        </p>
      </main>
    </div>
  );
}

/* ─────────────────────────── Viewer ─────────────────────────── */

function ViewerStage({ userId, onChangeRole }) {
  const [status, setStatus]       = useState('idle');
  const [error,  setError]        = useState('');
  const [view,   setView]         = useState({ x: 0, y: 0, scale: 1 });
  const videoRef    = useRef(null);
  const sessionRef  = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef  = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('starting');
    setError('');

    sessionRef.current = startViewer({
      userId,
      onStream: (stream) => {
        if (cancelled) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      },
      onStatus: (s) => { if (!cancelled) setStatus(s); },
      onError:  (m) => { if (!cancelled) setError(m); },
    });

    return () => {
      cancelled = true;
      try { sessionRef.current?.stop(); } catch { /* ignore */ }
      sessionRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [userId]);

  // ===== Gestures: drag to pan, pinch / wheel to zoom on the received stream =====
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        type: 'drag',
        startX: e.clientX, startY: e.clientY,
        startView: { ...view },
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      gestureRef.current = {
        type: 'pinch',
        startDist: Math.hypot(dx, dy),
        startView: { ...view },
      };
    }
  }, [view]);

  const onPointerMove = useCallback((e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;

    if (g.type === 'drag' && pointersRef.current.size === 1) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      setView({
        ...g.startView,
        x: g.startView.x + dx,
        y: g.startView.y + dy,
      });
    } else if (g.type === 'pinch' && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist = Math.hypot(dx, dy);
      const scale = Math.min(8, Math.max(1, g.startView.scale * (dist / g.startDist)));
      setView({ ...g.startView, scale });
    }
  }, []);

  const onPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      gestureRef.current = {
        type: 'drag',
        startX: remaining.x, startY: remaining.y,
        startView: { ...view },
      };
    }
  }, [view]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setView((v) => {
      const next = Math.min(8, Math.max(1, v.scale * (1 + delta)));
      // When we hit scale=1, recenter so a "zoom out fully" is also a clean reset.
      if (next === 1) return { x: 0, y: 0, scale: 1 };
      return { ...v, scale: next };
    });
  }, []);

  const resetView = () => setView({ x: 0, y: 0, scale: 1 });
  const zoomed = view.scale > 1.01 || view.x !== 0 || view.y !== 0;

  // The viewer's stream is one composite video — translate + scale it as a
  // single surface so the user can lean into any part of the broadcaster's view.
  const videoStyle = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
    transformOrigin: 'center center',
  };

  return (
    <div
      className="trace-stage live-viewer-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <video
        ref={videoRef}
        className="trace-video live-viewer-video"
        playsInline
        muted
        autoPlay
        style={videoStyle}
      />

      <header className="trace-topbar live-topbar">
        <button type="button" className="trace-icon-btn" onClick={onChangeRole} aria-label="Change role">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3 L5 9 L11 15 M5 9 H16" />
          </svg>
        </button>
        <div className={`live-pill live-pill-${statusTone(status)}`}>
          <span className="live-pill-dot" aria-hidden="true" />
          <span>{STATUS_LABEL[status] ?? status}</span>
        </div>
      </header>

      {zoomed && (
        <button
          type="button"
          className="live-viewer-reset"
          onClick={resetView}
          aria-label="Reset zoom"
        >
          {Math.round(view.scale * 100)}% · Reset
        </button>
      )}

      {error && (
        <div className="trace-error">
          <strong>Heads up</strong>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Broadcaster (trace + stream) ─────────────────────────── */

function BroadcasterStage({ userId, onChangeRole }) {
  const [overlayUrl,   setOverlayUrl]   = useState(null);
  const [transform,    setTransform]    = useState(INITIAL_TRANSFORM);
  const [opacity,      setOpacity]      = useLocalState('tm:live:opacity', 0.55);
  const [facingMode,   setFacingMode]   = useLocalState('tm:live:facingMode', 'environment');
  const [flickerOn,    setFlickerOn]    = useLocalState('tm:live:flickerOn', false);
  const [flickerSpeed, setFlickerSpeed] = useLocalState('tm:live:flickerSpeed', 3);
  const [status,       setStatus]       = useState('idle');
  const [error,        setError]        = useState('');
  const [cameraReady,  setCameraReady]  = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [ctaDismissed, setCtaDismissed]  = useState(false);

  const stageRef        = useRef(null);
  const canvasRef       = useRef(null);
  const videoRef        = useRef(null);
  const overlayImgRef   = useRef(null);
  const cameraStreamRef = useRef(null);
  const captureStreamRef = useRef(null);
  const sessionRef      = useRef(null);
  const fileInputRef    = useRef(null);
  const pointersRef     = useRef(new Map());
  const gestureRef      = useRef(null);
  const flickerOpacityRef = useRef(0);

  // ===== Camera setup =====
  useEffect(() => {
    let cancelled = false;
    setError('');

    const old = cameraStreamRef.current;
    if (old) old.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraReady(false);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(err?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow it in your browser settings to broadcast.'
          : 'Could not start the camera on this device.');
      }
    })();

    return () => {
      cancelled = true;
      const s = cameraStreamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    };
  }, [facingMode]);

  // ===== Canvas size — match the on-screen stage so transforms are 1:1 with finger movement =====
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage  = stageRef.current;
    if (!canvas || !stage) return;

    const resize = () => {
      const r = stage.getBoundingClientRect();
      // Cap longest side to 1080px to keep stream bandwidth reasonable on big monitors.
      const MAX = 1080;
      let w = Math.max(2, Math.round(r.width));
      let h = Math.max(2, Math.round(r.height));
      const m = Math.max(w, h);
      if (m > MAX) {
        const k = MAX / m;
        w = Math.round(w * k);
        h = Math.round(h * k);
      }
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  // ===== Compositing draw loop =====
  // drawRef is reassigned every render so it always closes over the latest
  // state; the rAF tick calls drawRef.current() so we never queue a stale draw.
  const drawRef = useRef(() => {});
  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cw = canvas.width;
    const ch = canvas.height;

    // Background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);

    // Camera with cover-fit semantics — fills the canvas, crops if needed.
    const video = videoRef.current;
    if (video && video.readyState >= 2 && video.videoWidth) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const vA = vw / vh;
      const cA = cw / ch;
      let sx, sy, sw, sh;
      if (vA > cA) {
        sh = vh;
        sw = vh * cA;
        sx = (vw - sw) / 2;
        sy = 0;
      } else {
        sw = vw;
        sh = vw / cA;
        sx = 0;
        sy = (vh - sh) / 2;
      }
      try { ctx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch); } catch { /* during transitions */ }
    }

    // Trace overlay — same model as the Trace page: centered, then translated/scaled/rotated.
    const overlay = overlayImgRef.current;
    if (overlay && overlay.complete && overlay.naturalWidth > 0) {
      const op = flickerOn ? flickerOpacityRef.current : opacity;
      if (op > 0.001) {
        const ar = overlay.naturalWidth / overlay.naturalHeight;
        // Fit into 70% of canvas — same default ratio as trace-overlay-img.
        let baseW = cw * 0.7;
        let baseH = baseW / ar;
        if (baseH > ch * 0.7) {
          baseH = ch * 0.7;
          baseW = baseH * ar;
        }
        ctx.save();
        ctx.globalAlpha = op;
        ctx.translate(cw / 2 + transform.x, ch / 2 + transform.y);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        const sx = transform.flip ? -transform.scale : transform.scale;
        ctx.scale(sx, transform.scale);
        ctx.drawImage(overlay, -baseW / 2, -baseH / 2, baseW, baseH);
        ctx.restore();
      }
    }
  };

  useEffect(() => {
    let rafId;
    const tick = () => {
      drawRef.current();
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // ===== Flicker animation — writes to a ref so we don't trigger 60fps re-renders =====
  useEffect(() => {
    if (!flickerOn) {
      flickerOpacityRef.current = 0;
      return;
    }
    let rafId;
    let startTs = null;
    const periodSec = 6 / Math.max(0.5, flickerSpeed);
    const tick = (ts) => {
      if (startTs == null) startTs = ts;
      const elapsed = (ts - startTs) / 1000;
      const phase = (elapsed / periodSec) * 2 * Math.PI;
      flickerOpacityRef.current = (1 - Math.cos(phase)) / 2;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [flickerOn, flickerSpeed]);

  // ===== Overlay image picker =====
  const onFilePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setOverlayUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setTransform(INITIAL_TRANSFORM);
  };

  // Revoke blob URL on unmount.
  useEffect(() => {
    return () => {
      if (overlayUrl?.startsWith('blob:')) URL.revokeObjectURL(overlayUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Start broadcasting once the camera is live =====
  // The composite stream is the canvas's captureStream — every frame we draw
  // (camera + overlay) goes out to the viewer as a single video track.
  useEffect(() => {
    if (!cameraReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stream;
    try {
      stream = canvas.captureStream(30);
    } catch {
      setError('This browser does not support live capture.');
      return;
    }
    captureStreamRef.current = stream;
    sessionRef.current = startBroadcaster({
      userId,
      stream,
      onStatus: (s) => setStatus(s),
      onError:  (m) => setError(m),
    });
    return () => {
      try { sessionRef.current?.stop(); } catch { /* ignore */ }
      sessionRef.current = null;
      try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      captureStreamRef.current = null;
    };
  }, [cameraReady, userId]);

  // ===== Gestures (drag, pinch, rotate) — same logic as Trace, mapped to canvas pixels =====
  const onPointerDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        type: 'drag',
        startX: e.clientX, startY: e.clientY,
        startTransform: { ...transform },
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      gestureRef.current = {
        type: 'pinch',
        startDist: Math.hypot(dx, dy),
        startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
        startTransform: { ...transform },
      };
    }
  }, [transform]);

  const onPointerMove = useCallback((e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (!g) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;

    if (g.type === 'drag' && pointersRef.current.size === 1) {
      const dx = (e.clientX - g.startX) * sx;
      const dy = (e.clientY - g.startY) * sy;
      setTransform({
        ...g.startTransform,
        x: g.startTransform.x + dx,
        y: g.startTransform.y + dy,
      });
    } else if (g.type === 'pinch' && pointersRef.current.size >= 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const dist  = Math.hypot(dx, dy);
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const scale = Math.min(8, Math.max(0.2, g.startTransform.scale * (dist / g.startDist)));
      const rotation = g.startTransform.rotation + (angle - g.startAngle);
      setTransform({ ...g.startTransform, scale, rotation });
    }
  }, []);

  const onPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    } else if (pointersRef.current.size === 1) {
      const remaining = Array.from(pointersRef.current.values())[0];
      gestureRef.current = {
        type: 'drag',
        startX: remaining.x, startY: remaining.y,
        startTransform: { ...transform },
      };
    }
  }, [transform]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY * 0.5;
      setTransform((t) => ({ ...t, rotation: t.rotation + delta }));
    } else {
      const delta = -e.deltaY * 0.0015;
      setTransform((t) => ({
        ...t,
        scale: Math.min(8, Math.max(0.2, t.scale * (1 + delta))),
      }));
    }
  }, []);

  const recenter     = () => setTransform((t) => ({ ...t, x: 0, y: 0 }));
  const flipH        = () => setTransform((t) => ({ ...t, flip: !t.flip }));
  const switchCamera = () => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));

  const tone = statusTone(status);
  const hasOverlay = !!overlayUrl;

  return (
    <div className="trace-stage live-trace-stage" ref={stageRef}>
      {/* Off-screen sources the canvas draws from. Kept in DOM (not display:none)
          so the video's decoder stays active and the image actually loads. */}
      <video
        ref={videoRef}
        className="live-trace-source"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />
      {overlayUrl && (
        <img
          ref={overlayImgRef}
          src={overlayUrl}
          alt=""
          className="live-trace-source"
          aria-hidden="true"
        />
      )}

      <canvas
        ref={canvasRef}
        className="live-trace-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      <header className="trace-topbar live-topbar">
        <button type="button" className="trace-icon-btn" onClick={onChangeRole} aria-label="Change role">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3 L5 9 L11 15 M5 9 H16" />
          </svg>
        </button>
        <div className={`live-pill live-pill-${tone}`}>
          <span className="live-pill-dot" aria-hidden="true" />
          <span>{STATUS_LABEL[status] ?? status}</span>
        </div>
      </header>

      {error && (
        <div className="trace-error">
          <button type="button" className="trace-error-close" onClick={() => setError('')} aria-label="Dismiss">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
          <strong>Heads up</strong>
          <p>{error}</p>
        </div>
      )}

      {!hasOverlay && cameraReady && !error && !ctaDismissed && (
        <div className="live-pick-cta">
          <strong>Add an image to trace</strong>
          <p>Camera + overlay is sent together to your other device.</p>
          <button type="button" className="upload-cta" onClick={() => fileInputRef.current?.click()}>
            Pick an image
          </button>
          <button type="button" className="live-skip-btn" onClick={() => setCtaDismissed(true)}>
            Broadcast camera only
          </button>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFilePick} />

      <footer className={`trace-controls ${controlsHidden ? 'is-hidden' : ''}`}>
        <button
          type="button"
          className="trace-handle"
          onClick={() => setControlsHidden((v) => !v)}
          aria-label={controlsHidden ? 'Show controls' : 'Hide controls'}
          aria-expanded={!controlsHidden}
        >
          <svg className="trace-handle-icon" width="22" height="22" viewBox="0 0 22 22" fill="none"
               stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {controlsHidden ? <path d="M5 13 L11 7 L17 13" /> : <path d="M5 9 L11 15 L17 9" />}
          </svg>
        </button>

        {!controlsHidden && (
          <div className="trace-controls-inner">
            <div className="trace-slider">
              <input
                type="range" min="0.05" max="1" step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                disabled={flickerOn || !hasOverlay}
                aria-label="Opacity"
                style={{ '--tm-slider-fill': `${(opacity - 0.05) / 0.95 * 100}%` }}
              />
              <span className="trace-slider-value">{Math.round(opacity * 100)}%</span>
            </div>

            {flickerOn && hasOverlay && (
              <div className="trace-slider">
                <span className="trace-slider-label" aria-hidden="true">Speed</span>
                <input
                  type="range" min="1" max="10" step="0.5"
                  value={flickerSpeed}
                  onChange={(e) => setFlickerSpeed(parseFloat(e.target.value))}
                  aria-label="Flicker speed"
                  style={{ '--tm-slider-fill': `${(flickerSpeed - 1) / 9 * 100}%` }}
                />
                <span className="trace-slider-value">{flickerSpeed.toFixed(1)}×</span>
              </div>
            )}

            <div className="trace-toggles">
              <button type="button" className="trace-action-btn" onClick={() => fileInputRef.current?.click()}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
                  <path d="M2.5 12 L7 8 L11 12 L14 9 L17.5 12.5" />
                  <circle cx="13" cy="7" r="1.5" />
                </svg>
                <span>{hasOverlay ? 'Change' : 'Image'}</span>
              </button>

              <button
                type="button"
                className={`trace-action-btn ${flickerOn ? 'is-active' : ''}`}
                disabled={!hasOverlay}
                onClick={() => setFlickerOn((v) => !v)}
                aria-pressed={flickerOn}
                aria-label={flickerOn ? 'Turn flicker off' : 'Turn flicker on'}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 10 L5 10 L7 5 L10 15 L13 5 L15 10 L18 10" />
                </svg>
                <span>Flicker</span>
              </button>

              <button type="button" className="trace-action-btn" onClick={flipH} disabled={!hasOverlay} aria-label="Flip horizontally">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3 V17" strokeDasharray="2 2" />
                  <path d="M3 6 L8 6 L8 14 L3 14 Z" />
                  <path d="M17 6 L12 6 L12 14 L17 14 Z" fill="currentColor" fillOpacity="0.25" />
                </svg>
                <span>Flip</span>
              </button>

              <button type="button" className="trace-action-btn" onClick={recenter} disabled={!hasOverlay} aria-label="Center overlay">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="10" cy="10" r="6.5" />
                  <circle cx="10" cy="10" r="1.4" fill="currentColor" />
                  <path d="M10 1.5 V4 M10 16 V18.5 M1.5 10 H4 M16 10 H18.5" />
                </svg>
                <span>Center</span>
              </button>

              <button type="button" className="trace-action-btn" onClick={switchCamera} aria-label="Switch camera">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6.5 H6 L7.5 5 H12.5 L14 6.5 H17 a1 1 0 0 1 1 1 V15 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V7.5 a1 1 0 0 1 1 -1 Z" />
                  <path d="M10 9.5 a2 2 0 1 0 2 2" />
                  <path d="M12 9.5 V8 H10.5" />
                </svg>
                <span>Camera</span>
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function LivePreview() {
  const { user } = useAuth();
  const [role, setRole] = useState(null); // null | 'broadcaster' | 'viewer'

  if (!user) return null;
  if (!role) return <RolePicker onPick={setRole} />;
  if (role === 'viewer') {
    return <ViewerStage userId={user.id} onChangeRole={() => setRole(null)} />;
  }
  return <BroadcasterStage userId={user.id} onChangeRole={() => setRole(null)} />;
}
