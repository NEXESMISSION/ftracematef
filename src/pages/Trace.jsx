import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalState } from '../lib/useLocalState.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { startSession, addSessionDuration } from '../lib/traceStats.js';
import { loadPendingImage } from '../lib/pendingImage.js';
import { consumeFreeSession, trialAlreadyConsumedThisVisit } from '../lib/freeTrial.js';
import { setPresence, clearPresence } from '../lib/presence.js';
import {
  cssMatrix3d,
  identityCorners,
  isIdentity,
  screenDeltaToLocal,
} from '../lib/perspectiveWarp.js';

const INITIAL_TRANSFORM = { x: 0, y: 0, scale: 1, rotation: 0, flip: false };

export default function Trace() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, session, refresh } = useAuth();

  // Prefer the freshly-passed blob URL from /upload (instant).
  // Fall back to the persisted base64 from sessionStorage (post-OAuth + post-payment).
  //
  // CRITICAL: capture once on mount and freeze. Recomputing this every render
  // races with the cleanup effect that revokes blob URLs — `location.state`
  // can be cleared by React Router during the /checkout/success → /upload →
  // /trace flow, flipping the dependency between a blob URL and a data URL,
  // which causes the cleanup to revoke a blob the next render is still
  // showing. Locking it on first render eliminates the race.
  const [imageUrl] = useState(
    () => location.state?.imageUrl || loadPendingImage()?.dataUrl || null,
  );
  // Captured at mount alongside imageUrl. Used as the human-readable label
  // we send to the server so the admin dashboard can show "tracing
  // puppy.jpg" instead of just "tracing". Falls back to the freshly-uploaded
  // file name from /upload, then to the persisted pending-image meta, then
  // to a generic placeholder when neither is available.
  const [imageLabel] = useState(
    () => location.state?.imageName || loadPendingImage()?.name || 'image',
  );

  const videoRef    = useRef(null);
  const overlayRef  = useRef(null);
  const streamRef   = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef  = useRef(null);

  const [transform, setTransform]           = useState(INITIAL_TRANSFORM);
  // Persisted across sessions via localStorage so the studio remembers your setup.
  const [opacity, setOpacity]               = useLocalState('tm:opacity', 0.55);
  const [facingMode, setFacingMode]         = useLocalState('tm:facingMode',  'environment'); // 'environment' | 'user'
  const [cameraError, setCameraError]       = useState('');
  const [showHint, setShowHint]             = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn]               = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [flickerOn, setFlickerOn]           = useLocalState('tm:flickerOn', false);
  const [flickerSpeed, setFlickerSpeed]     = useLocalState('tm:flickerSpeed', 3);
  // Bounds for the flicker oscillation. Defaults give a clearly-visible
  // breathing effect without ever fully disappearing or going fully opaque
  // — both extremes make the reference hard to align against. Persisted so
  // a user's tuned bounds stick across sessions.
  const [flickerMin, setFlickerMin]         = useLocalState('tm:flickerMin', 0.15);
  const [flickerMax, setFlickerMax]         = useLocalState('tm:flickerMax', 0.85);
  const [flickerOpacity, setFlickerOpacity] = useState(0);
  const [warpMode, setWarpMode]             = useState(false);
  const [corners, setCorners]               = useState(null);
  const [baseSize, setBaseSize]             = useState(null);
  const handleDragRef                       = useRef(null);

  // No image? Bounce back to upload.
  useEffect(() => {
    if (!imageUrl) navigate('/upload', { replace: true });
  }, [imageUrl, navigate]);

  // Free-tier users get FREE_SESSION_LIMIT tracing sessions before the
  // paywall. Burn one per fresh /trace visit (a refresh inside the studio
  // doesn't double-consume — see trialAlreadyConsumedThisVisit). Guarding
  // on imageUrl prevents a stale /trace visit (no image, immediately
  // redirected to /upload) from silently burning the user's count.
  //
  // Consume regardless of paid status. A paid user burns the counter too;
  // it's harmless while they're paid (the cap is silent — RPC just returns
  // the current count once at the limit) and prevents a paid → free
  // transition (refund, expired sub, admin dev-mutate) from handing the
  // same account a fresh batch on top of whatever they already used.
  useEffect(() => {
    if (!imageUrl) return;
    if (!user?.id) return;
    if (trialAlreadyConsumedThisVisit()) return;
    let cancelled = false;
    consumeFreeSession()
      .then((count) => { if (!cancelled && count !== null) refresh(); })
      .catch((err) => console.warn('[trace] could not consume free session:', err));
    return () => { cancelled = true; };
  }, [imageUrl, user?.id, refresh]);

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

  // ===== Warp: measure rendered overlay size + seed identity corners =====
  useEffect(() => {
    const img = overlayRef.current;
    if (!img) return;
    const measure = () => {
      const w = img.offsetWidth;
      const h = img.offsetHeight;
      if (w && h) {
        setBaseSize((prev) => (prev?.w === w && prev?.h === h ? prev : { w, h }));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    img.addEventListener('load', measure);
    return () => {
      ro.disconnect();
      img.removeEventListener('load', measure);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!baseSize) return;
    setCorners((prev) => prev ?? identityCorners(baseSize.w, baseSize.h));
  }, [baseSize]);

  // ===== Warp handle drag (pointer events captured per-handle) =====
  const onHandleDown = useCallback((key, e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    handleDragRef.current = {
      key,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startCorner: corners ? { ...corners[key] } : null,
      startTransform: { ...transform },
    };
  }, [corners, transform]);

  const onHandleMove = useCallback((e) => {
    const d = handleDragRef.current;
    if (!d || d.pointerId !== e.pointerId || !d.startCorner) return;
    e.stopPropagation();
    const dxScreen = e.clientX - d.startX;
    const dyScreen = e.clientY - d.startY;
    const local = screenDeltaToLocal(
      dxScreen, dyScreen,
      d.startTransform.scale, d.startTransform.rotation, d.startTransform.flip,
    );
    setCorners((cs) => cs && {
      ...cs,
      [d.key]: {
        x: d.startCorner.x + local.x,
        y: d.startCorner.y + local.y,
      },
    });
  }, []);

  const onHandleUp = useCallback((e) => {
    const d = handleDragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    e.stopPropagation();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    handleDragRef.current = null;
  }, []);

  const resetWarp = useCallback(() => {
    if (baseSize) setCorners(identityCorners(baseSize.w, baseSize.h));
  }, [baseSize]);

  // Flicker: smoothly oscillate overlay opacity between flickerMin and
  // flickerMax while enabled. flickerSpeed is a 1–10 dial; period in
  // seconds = 6 / flickerSpeed. The cosine sweep produces a value in
  // [0,1] which we then linearly map onto [min,max] so the user can keep
  // the reference visible at all times (e.g. 20% → 80% never blanks the
  // overlay) without losing the rhythm of the breathing motion.
  //
  // Defensive: if min ≥ max (user dragged them past each other), pin to a
  // tiny epsilon so the math doesn't invert and produce a negative range.
  useEffect(() => {
    if (!flickerOn) return;
    let rafId;
    let startTs = null;
    const periodSec = 6 / Math.max(0.5, flickerSpeed);
    const lo = Math.max(0, Math.min(1, flickerMin));
    const hi = Math.max(lo + 0.01, Math.min(1, flickerMax));
    const span = hi - lo;
    const tick = (ts) => {
      if (startTs == null) startTs = ts;
      const elapsed = (ts - startTs) / 1000;
      const phase = (elapsed / periodSec) * 2 * Math.PI;
      const t = (1 - Math.cos(phase)) / 2;
      setFlickerOpacity(lo + t * span);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [flickerOn, flickerSpeed, flickerMin, flickerMax]);

  // ===== Track tracing sessions =====
  // Server-authoritative session tracking. Open a trace_session_runs row on
  // mount (start_trace_run), keep it alive with periodic heartbeats, close it
  // on exit (end_trace_run). The server computes duration from started_at
  // and the close time — the client doesn't need to track active seconds
  // anymore, which means we no longer lose sessions when the OS kills the
  // tab without firing pagehide. Any row whose heartbeat goes stale gets
  // reconciled by reconcile_trace_runs() (called from the admin endpoint
  // and from start_trace_run when the user comes back), credited up to its
  // last heartbeat — so a hard-killed session still counts as ~the actual
  // time the user was tracing, not zero.
  //
  // We also stamp the local /account scrapbook (addSessionDuration) with a
  // best-effort estimate computed from started_at on close, so the user's
  // own stats keep updating without re-querying. The server is the source
  // of truth; this is just the cached mirror.
  //
  // Three exit paths to handle:
  //   1. Click End session → unmount → effect cleanup → end_trace_run.
  //   2. Browser back / route change → same as 1.
  //   3. Tab close / app kill → pagehide event → end_trace_run via
  //      `fetch({ keepalive: true })`. The supabase JS client doesn't expose
  //      keepalive; hit the REST RPC endpoint directly so the request
  //      survives the tear-down.
  //
  // If pagehide doesn't fire (forced kill, OOM, swipe-away on some Android
  // builds), no end_trace_run lands — but the heartbeat goes stale within
  // ~30s and reconcile_trace_runs() finishes the job for us.
  //
  // Guards: startedRef gates the start RPC against StrictMode's dev
  // double-mount; endedRef gates against a pagehide racing the unmount
  // cleanup so we don't fire end_trace_run twice in quick succession.
  //
  // accessTokenRef holds the latest access token, updated whenever the
  // session refreshes. We read it on demand (heartbeat, close) instead of
  // capturing it in the effect's closure — token rotation during a long
  // tracing session would otherwise re-run the effect, fire its cleanup
  // (closing the run prematurely!), and leave a half-dead heartbeat
  // pinging with no row.
  const startedRef    = useRef(false);
  const endedRef      = useRef(false);
  const runIdRef      = useRef(null);
  const startedAtRef  = useRef(null);
  const accessTokenRef = useRef(null);
  useEffect(() => {
    accessTokenRef.current = session?.access_token || null;
  }, [session?.access_token]);
  useEffect(() => {
    if (!imageUrl) return;
    if (!user?.id) return;
    endedRef.current = false;
    runIdRef.current = null;
    startedAtRef.current = null;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const haveSupabaseEnv = !!(supabaseUrl && anonKey);

    // Tell the AuthProvider's presence stream we're in the trace studio
    // even before the run RPC lands — that way the next 60s heartbeat
    // reflects the user's actual page even if start_trace_run fails.
    setPresence('trace', imageLabel);

    // Bump the local sessions count immediately so the user sees their
    // /account scrapbook tick up without waiting on the server. The DB
    // mirror is bumped by start_trace_run RPC.
    if (!startedRef.current) {
      startedRef.current = true;
      startSession(user.id);

      const accessToken = accessTokenRef.current;
      if (haveSupabaseEnv && accessToken) {
        startedAtRef.current = Date.now();
        try {
          fetch(`${supabaseUrl}/rest/v1/rpc/start_trace_run`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': anonKey,
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ p_image_label: imageLabel }),
          })
            .then((res) => res.ok ? res.json() : null)
            .then((data) => {
              // RPC with returns scalar uuid → PostgREST hands back the
              // bare value as JSON. Defensive: only adopt a uuid-shaped
              // string so a malformed response can't poison subsequent calls.
              if (typeof data === 'string' && data.length === 36) {
                runIdRef.current = data;
              }
            })
            .catch((err) => console.warn('[trace] start_trace_run failed:', err));
        } catch (err) {
          console.warn('[trace] start_trace_run threw:', err);
        }
      }
    }

    // Heartbeat every 30s while the tab is visible. Stops on hidden so a
    // backgrounded tab doesn't keep a phantom run alive forever — the
    // server's reconciler will close it after the stale window. Resumes
    // when the tab returns to visible (the user came back).
    const HEARTBEAT_MS = 30_000;
    let heartbeatTimer = null;
    const ping = () => {
      const runId = runIdRef.current;
      const accessToken = accessTokenRef.current;
      if (!runId || !haveSupabaseEnv || !accessToken) return;
      try {
        fetch(`${supabaseUrl}/rest/v1/rpc/heartbeat_trace_run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ p_run_id: runId }),
        }).catch(() => { /* presence is best-effort */ });
      } catch { /* ignore */ }
    };
    const startHeartbeat = () => {
      if (heartbeatTimer != null) return;
      ping();
      heartbeatTimer = setInterval(ping, HEARTBEAT_MS);
    };
    const stopHeartbeat = () => {
      if (heartbeatTimer != null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') startHeartbeat();
      else stopHeartbeat();
    };
    if (document.visibilityState === 'visible') startHeartbeat();

    // Close the run + mirror duration into the local scrapbook. Idempotent
    // — endedRef guards against pagehide racing the unmount cleanup.
    const finish = (reason) => {
      if (endedRef.current) return;
      endedRef.current = true;
      stopHeartbeat();
      clearPresence();

      const runId    = runIdRef.current;
      const startedAt = startedAtRef.current;

      // Best-effort local mirror: estimate the duration from the timer we
      // captured at start so the /account scrapbook updates immediately
      // without a server round-trip. The server-side total is authoritative
      // and updated by end_trace_run / reconcile_trace_runs.
      if (startedAt != null) {
        const seconds = (Date.now() - startedAt) / 1000;
        if (seconds > 0 && seconds < 86400) {
          addSessionDuration(user.id, seconds);
        }
      }

      const accessToken = accessTokenRef.current;
      if (!runId || !haveSupabaseEnv || !accessToken) return;
      try {
        fetch(`${supabaseUrl}/rest/v1/rpc/end_trace_run`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'apikey': anonKey,
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ p_run_id: runId, p_reason: reason }),
        }).catch((err) => console.warn('[trace] end_trace_run failed:', err));
      } catch (err) {
        console.warn('[trace] end_trace_run threw:', err);
      }
    };

    const onPagehide = () => finish('unload');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPagehide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPagehide);
      finish('client_end');
    };
    // Intentionally exclude session.access_token: a token rotation in the
    // middle of a long tracing session would re-run the effect, fire the
    // cleanup (closing the run prematurely), and start a new effect that
    // can't issue start_trace_run again because startedRef is already true
    // — the heartbeat would then ping with a null runId. accessTokenRef
    // gives later RPCs the freshest token without re-running the effect.
  }, [imageUrl, imageLabel, user?.id]);

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
  }, [transform]);

  const onPointerMove = useCallback((e) => {
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
  }, []);

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

  // ===== Quick actions =====
  const recenter       = () => setTransform((t) => ({ ...t, x: 0, y: 0 }));
  const flipHorizontal = () => setTransform((t) => ({ ...t, flip: !t.flip }));
  const switchCamera   = () => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'));

  const exitTrace = () => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    navigate('/upload');
  };

  if (!imageUrl) return null;

  const warpMatrix =
    corners && baseSize && !isIdentity(corners, baseSize.w, baseSize.h)
      ? cssMatrix3d(baseSize.w, baseSize.h, corners)
      : '';

  const overlayStyle = {
    transform:
      `translate(-50%, -50%) ` +
      `translate(${transform.x}px, ${transform.y}px) ` +
      `scale(${transform.flip ? -transform.scale : transform.scale}, ${transform.scale}) ` +
      `rotate(${transform.rotation}deg)` +
      (warpMatrix ? ` ${warpMatrix}` : ''),
    opacity: flickerOn ? flickerOpacity : opacity,
    // Skip the 0.15s opacity easing while flickering — rAF already drives a smooth curve.
    transition: flickerOn ? 'transform 0.15s ease, filter 0.2s ease' : undefined,
  };

  const handleWrapStyle = baseSize ? {
    transform:
      `translate(${transform.x}px, ${transform.y}px) ` +
      `scale(${transform.flip ? -transform.scale : transform.scale}, ${transform.scale}) ` +
      `rotate(${transform.rotation}deg)`,
  } : null;

  return (
    <div className="trace-stage">
      <video ref={videoRef} className="trace-video" playsInline muted autoPlay />

      <div
        className="trace-overlay-wrap"
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

        {warpMode && corners && handleWrapStyle && (
          <div className="warp-handles" style={handleWrapStyle}>
            {(['tl', 'tr', 'br', 'bl']).map((key) => (
              <button
                key={key}
                type="button"
                className={`warp-handle warp-handle-${key}`}
                style={{ left: `${corners[key].x}px`, top: `${corners[key].y}px` }}
                onPointerDown={(e) => onHandleDown(key, e)}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                aria-label={`Warp corner ${key}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Top bar — explicit "End session" button. Renamed from a back arrow
          because users read the back arrow as "I might come back later" and
          bounced out before the time-tracking effect's persist() flushed,
          leaving brief sessions uncounted in the /account stats. The button
          still calls exitTrace → navigate('/upload') → unmount → persist,
          so behaviour is identical; only the label changed. */}
      <header className="trace-topbar">
        <button type="button" className="trace-end-btn" onClick={exitTrace} aria-label="End session">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="1.5" />
          </svg>
          <span>End session</span>
        </button>
      </header>

      {/* Hint */}
      {showHint && !cameraError && (
        <div className="trace-hint">
          Drag to move · Pinch to zoom · Twist to rotate
        </div>
      )}

      {warpMode && baseSize && corners && !isIdentity(corners, baseSize.w, baseSize.h) && (
        <button type="button" className="warp-reset" onClick={resetWarp}>
          Reset warp
        </button>
      )}

      {/* Camera error */}
      {cameraError && (
        <div className="trace-error">
          <button
            type="button"
            className="trace-error-close"
            onClick={() => setCameraError('')}
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
          <strong>Camera unavailable</strong>
          <p>{cameraError}</p>
          <button type="button" className="upload-cta" onClick={exitTrace}>
            Back to upload
          </button>
        </div>
      )}

      {/* Bottom controls — collapsible compact dock */}
      <footer className={`trace-controls ${controlsHidden ? 'is-hidden' : ''}`}>
        {/* Big chevron handle — toggles hide/show */}
        <button
          type="button"
          className="trace-handle"
          onClick={() => setControlsHidden((v) => !v)}
          aria-label={controlsHidden ? 'Show controls' : 'Hide controls'}
          aria-expanded={!controlsHidden}
        >
          <svg
            className="trace-handle-icon"
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {controlsHidden ? (
              <path d="M5 13 L11 7 L17 13" />
            ) : (
              <path d="M5 9 L11 15 L17 9" />
            )}
          </svg>
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
                disabled={flickerOn}
                aria-label="Opacity"
                style={{ '--tm-slider-fill': `${(opacity - 0.05) / 0.95 * 100}%` }}
              />
              <span className="trace-slider-value">{Math.round(opacity * 100)}%</span>
            </div>

            {flickerOn && (
              <>
                <div className="trace-slider">
                  <span className="trace-slider-label" aria-hidden="true">Speed</span>
                  <input
                    id="flicker-speed"
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={flickerSpeed}
                    onChange={(e) => setFlickerSpeed(parseFloat(e.target.value))}
                    aria-label="Flicker speed"
                    style={{ '--tm-slider-fill': `${(flickerSpeed - 1) / 9 * 100}%` }}
                  />
                  <span className="trace-slider-value">{flickerSpeed.toFixed(1)}×</span>
                </div>
                {/* Min / Max bound the oscillation so the overlay never
                    blanks (good for keeping reference visible at all times)
                    or fully blocks the camera. We clamp Min to stay <= Max
                    minus a small gap, and vice-versa, so users can drag
                    them freely without the bounds crossing. */}
                <div className="trace-slider">
                  <span className="trace-slider-label" aria-hidden="true">Min</span>
                  <input
                    id="flicker-min"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={flickerMin}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value);
                      setFlickerMin(next);
                      if (next >= flickerMax - 0.05) {
                        setFlickerMax(Math.min(1, next + 0.05));
                      }
                    }}
                    aria-label="Flicker minimum opacity"
                    style={{ '--tm-slider-fill': `${flickerMin * 100}%` }}
                  />
                  <span className="trace-slider-value">{Math.round(flickerMin * 100)}%</span>
                </div>
                <div className="trace-slider">
                  <span className="trace-slider-label" aria-hidden="true">Max</span>
                  <input
                    id="flicker-max"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={flickerMax}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value);
                      setFlickerMax(next);
                      if (next <= flickerMin + 0.05) {
                        setFlickerMin(Math.max(0, next - 0.05));
                      }
                    }}
                    aria-label="Flicker maximum opacity"
                    style={{ '--tm-slider-fill': `${flickerMax * 100}%` }}
                  />
                  <span className="trace-slider-value">{Math.round(flickerMax * 100)}%</span>
                </div>
              </>
            )}

            <div className="trace-toggles">
              <button
                type="button"
                className={`trace-action-btn ${flickerOn ? 'is-active' : ''}`}
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

              <button
                type="button"
                className="trace-action-btn"
                onClick={flipHorizontal}
                aria-label="Flip horizontally"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3 V17" strokeDasharray="2 2" />
                  <path d="M3 6 L8 6 L8 14 L3 14 Z" />
                  <path d="M17 6 L12 6 L12 14 L17 14 Z" fill="currentColor" fillOpacity="0.25" />
                </svg>
                <span>Flip</span>
              </button>

              <button
                type="button"
                className={`trace-action-btn ${warpMode ? 'is-active' : ''}`}
                onClick={() => setWarpMode((v) => !v)}
                aria-pressed={warpMode}
                aria-label={warpMode ? 'Exit warp mode' : 'Enter warp mode'}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 4 L16 5 L17 16 L4.5 14.5 Z" />
                  <circle cx="3.5" cy="4"   r="1.4" fill="currentColor" />
                  <circle cx="16"  cy="5"   r="1.4" fill="currentColor" />
                  <circle cx="17"  cy="16"  r="1.4" fill="currentColor" />
                  <circle cx="4.5" cy="14.5" r="1.4" fill="currentColor" />
                </svg>
                <span>Warp</span>
              </button>

              <button
                type="button"
                className="trace-action-btn"
                onClick={recenter}
                aria-label="Center overlay"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="10" cy="10" r="6.5" />
                  <circle cx="10" cy="10" r="1.4" fill="currentColor" />
                  <path d="M10 1.5 V4 M10 16 V18.5 M1.5 10 H4 M16 10 H18.5" />
                </svg>
                <span>Center</span>
              </button>

              <button
                type="button"
                className="trace-action-btn"
                onClick={switchCamera}
                aria-label="Switch camera"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6.5 H6 L7.5 5 H12.5 L14 6.5 H17 a1 1 0 0 1 1 1 V15 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V7.5 a1 1 0 0 1 1 -1 Z" />
                  <path d="M10 9.5 a2 2 0 1 0 2 2" />
                  <path d="M12 9.5 V8 H10.5" />
                </svg>
                <span>Camera</span>
              </button>

              {torchSupported && (
                <button
                  type="button"
                  className={`trace-action-btn ${torchOn ? 'is-active' : ''}`}
                  onClick={toggleTorch}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2 L4.5 11 H9.5 L8 18 L15.5 9 H10.5 L12 2 Z" />
                  </svg>
                  <span>Flash</span>
                </button>
              )}
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
