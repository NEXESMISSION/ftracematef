import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalState } from '../lib/useLocalState.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { addSession } from '../lib/traceStats.js';
import { loadPendingImage } from '../lib/pendingImage.js';

const INITIAL_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, flip: false };

export default function Trace() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Prefer the freshly-passed blob URL from /upload (instant).
  // Fall back to the persisted base64 from sessionStorage (post-OAuth + post-payment).
  const imageUrl = location.state?.imageUrl || loadPendingImage()?.dataUrl || null;

  const videoRef    = useRef(null);
  const overlayRef  = useRef(null);
  const streamRef   = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef  = useRef(null);

  const [transform, setTransform]           = useState(INITIAL_TRANSFORM);
  // Persisted across sessions via localStorage so the studio remembers your setup.
  const [opacity, setOpacity]               = useLocalState('tm:opacity', 0.55);
  const [locked, setLocked]                 = useLocalState('tm:locked',  false);
  const [facingMode, setFacingMode]         = useLocalState('tm:facingMode',  'environment'); // 'environment' | 'user'
  const [cameraError, setCameraError]       = useState('');
  const [showHint, setShowHint]             = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn]               = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);

  // No image? Bounce back to upload.
  useEffect(() => {
    if (!imageUrl) navigate('/upload', { replace: true });
  }, [imageUrl, navigate]);

  // Revoke the object URL when leaving the trace page so we don't leak it.
  useEffect(() => {
    if (!imageUrl) return;
    return () => {
      if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // Start (or restart) the camera whenever facingMode changes.
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      // Tear down any existing stream first
      const old = streamRef.current;
      if (old) old.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        // Detect torch support on the back camera.
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities();
          if (caps?.torch) setTorchSupported(true);
        }
        setCameraError('');
      } catch (err) {
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings to start tracing.'
            : 'Could not start the camera. Try a different browser or device.'
        );
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  // Auto-hide the gesture hint after a moment
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  // ===== Track tracing time =====
  // Accumulate active seconds (paused when tab is hidden) and persist on exit.
  useEffect(() => {
    if (!imageUrl) return;
    let elapsedMs = 0;
    let activeSince = document.visibilityState === 'visible' ? Date.now() : null;

    const flushActive = () => {
      if (activeSince != null) {
        elapsedMs += Date.now() - activeSince;
        activeSince = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (activeSince == null) activeSince = Date.now();
      } else {
        flushActive();
      }
    };

    const persist = () => {
      flushActive();
      addSession(user?.id, elapsedMs / 1000);
      elapsedMs = 0;
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', persist);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', persist);
      persist();
    };
  }, [imageUrl, user?.id]);

  // Toggle torch on the active video track. Wrapped in a try because not all
  // devices support it even when `caps.torch` is true (Safari quirks).
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((v) => !v);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
      setTorchSupported(false); // hide the button if it never worked
    }
  }, [torchOn]);

  // ===== Gesture handling: drag (1 pointer), pinch + rotate (2 pointers) =====
  const onPointerDown = useCallback((e) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        type: 'drag',
        startX: e.clientX,
        startY: e.clientY,
        startTransform: { ...transform },
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      gestureRef.current = {
        type: 'pinch',
        startDist:  Math.hypot(dx, dy),
        startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
        startTransform: { ...transform },
      };
    }
  }, [locked, transform]);

  const onPointerMove = useCallback((e) => {
    if (locked) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setShowHint(false);

    const g = gestureRef.current;
    if (!g) return;

    if (g.type === 'drag' && pointersRef.current.size === 1) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
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
  }, [locked]);

  const onPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
    } else if (pointersRef.current.size === 1) {
      // Switching from pinch back to drag — re-anchor
      const remaining = Array.from(pointersRef.current.values())[0];
      gestureRef.current = {
        type: 'drag',
        startX: remaining.x,
        startY: remaining.y,
        startTransform: { ...transform },
      };
    }
  }, [transform]);

  // Wheel on desktop = zoom (Ctrl/⌘ + wheel rotates)
  const onWheel = useCallback((e) => {
    if (locked) return;
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
  }, [locked]);

  // ===== Quick actions =====
  const resetTransform = () => setTransform(INITIAL_TRANSFORM);
  const recenter       = () => setTransform((t) => ({ ...t, x: 0, y: 0 }));
  const flipHorizontal = () => setTransform((t) => ({ ...t, flip: !t.flip }));
  const switchCamera   = () => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));

  const exitTrace = () => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    navigate('/upload');
  };

  if (!imageUrl) return null;

  const overlayStyle = {
    transform:
      `translate(-50%, -50%) ` +
      `translate(${transform.x}px, ${transform.y}px) ` +
      `scale(${transform.flip ? -transform.scale : transform.scale}, ${transform.scale}) ` +
      `rotate(${transform.rotation}deg)`,
    opacity,
  };

  return (
    <div className="trace-stage">
      <video ref={videoRef} className="trace-video" playsInline muted autoPlay />

      <div
        className={`trace-overlay-wrap ${locked ? 'is-locked' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <img
          ref={overlayRef}
          src={imageUrl}
          alt="Reference overlay"
          className="trace-overlay-img"
          style={overlayStyle}
          draggable={false}
        />
      </div>

      {/* Top bar — back button only */}
      <header className="trace-topbar">
        <button type="button" className="trace-icon-btn" onClick={exitTrace} aria-label="Back to upload">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 3 L5 9 L11 15 M5 9 H16" />
          </svg>
        </button>
      </header>

      {/* Hint */}
      {showHint && !cameraError && (
        <div className="trace-hint">
          Drag to move · Pinch to zoom · Twist to rotate
        </div>
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="trace-error">
          <strong>Camera unavailable</strong>
          <p>{cameraError}</p>
          <button type="button" className="upload-cta" onClick={exitTrace}>
            Back to upload
          </button>
        </div>
      )}

      {/* Bottom controls — collapsible compact dock */}
      <footer className={`trace-controls ${controlsHidden ? 'is-hidden' : ''}`}>
        {/* Pull-tab handle — toggles hide/show */}
        <button
          type="button"
          className="trace-handle"
          onClick={() => setControlsHidden((v) => !v)}
          aria-label={controlsHidden ? 'Show controls' : 'Hide controls'}
          aria-expanded={!controlsHidden}
        >
          <span className="trace-handle-bar" />
        </button>

        {!controlsHidden && (
          <div className="trace-controls-inner">
            <div className="trace-slider">
              <input
                id="opacity"
                type="range"
                min="0.05"
                max="1"
                step="0.01"
                value={opacity}
                onChange={(e) => setOpacity(parseFloat(e.target.value))}
                aria-label="Opacity"
              />
              <span className="trace-slider-value">{Math.round(opacity * 100)}%</span>
            </div>

            <div className="trace-toggles">
              <button
                type="button"
                className="trace-text-btn"
                onClick={flipHorizontal}
                aria-label="Flip horizontally"
              >
                Flip
              </button>

              <button
                type="button"
                className="trace-text-btn"
                onClick={recenter}
                aria-label="Center overlay"
              >
                Center
              </button>

              <button
                type="button"
                className="trace-mini-btn"
                onClick={resetTransform}
                aria-label="Reset overlay"
                title="Reset"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 8 a5.5 5.5 0 1 0 1.7 -3.9 M2.5 2.5 V5.2 H5.2" />
                </svg>
              </button>

              <span className="trace-divider" aria-hidden="true" />

              <button
                type="button"
                className={`trace-mini-btn ${locked ? 'is-active' : ''}`}
                onClick={() => setLocked((v) => !v)}
                aria-pressed={locked}
                aria-label={locked ? 'Unlock overlay' : 'Lock overlay'}
                title={locked ? 'Unlock' : 'Lock'}
              >
                {locked ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                    <path d="M5.5 7 V5 a2.5 2.5 0 0 1 5 0 V7" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
                    <path d="M5.5 7 V5 a2.5 2.5 0 0 1 4.5 -1" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                className="trace-mini-btn"
                onClick={switchCamera}
                aria-label="Switch camera"
                title="Switch camera"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 5.5 H5 L6.3 4 H9.7 L11 5.5 H13.5 a1 1 0 0 1 1 1 V12.5 a1 1 0 0 1 -1 1 H2.5 a1 1 0 0 1 -1 -1 V6.5 a1 1 0 0 1 1 -1 Z" />
                  <path d="M8 8 a2 2 0 1 0 2 2" />
                  <path d="M10 8.5 V7 H8.5" />
                </svg>
              </button>

              {torchSupported && (
                <button
                  type="button"
                  className={`trace-mini-btn ${torchOn ? 'is-active' : ''}`}
                  onClick={toggleTorch}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'}
                  title={torchOn ? 'Flash off' : 'Flash on'}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M10 1 L3.5 9 H8 L6.5 15 L12.5 7 H8 L10 1 Z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
