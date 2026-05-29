import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalState } from '../lib/useLocalState.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { loadPendingImage } from '../lib/pendingImage.js';
import { consumeFreeSession, trialAlreadyConsumedThisVisit } from '../lib/freeTrial.js';
import { setPresence, clearPresence } from '../lib/presence.js';
import { setTracing } from '../lib/tracing-state.js';
import { startRecording, isRecordingSupported } from '../lib/recorder.js';
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
  // Bottom-dock segmented control. 'opacity' = the single opacity slider
  // (default; cheapest to render), 'adjust' = the move/zoom/rotate
  // sliders, 'flicker' = the pulse-mode panel. Stored locally so a tab
  // refresh doesn't dump the user back into Opacity mid-tracing.
  const [panelTab, setPanelTab] = useLocalState('tm:panelTab', 'opacity');

  // Idle dim. After 10s with no click/tap/wheel/keypress the on-screen
  // chrome (topbar, controls dock, warp reset) fades to a low opacity so
  // it's out of the way during long focused tracing sessions and out of
  // shot during recordings. Any interaction snaps it back instantly.
  // Hover alone is intentionally NOT counted — on desktop it would keep
  // the timer constantly reset just because the cursor crossed the window.
  const [idle, setIdle] = useState(false);

  // Recording state. recordIncludeOverlay persists the user's last choice so
  // they don't have to re-tick the box on every visit. The stopper ref holds
  // the {stop} handle returned by startRecording — null when idle.
  const [recordIncludeOverlay, setRecordIncludeOverlay] = useLocalState('tm:recordOverlay', true);
  const [recording, setRecording]   = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [recordError, setRecordError] = useState('');
  const recordStopperRef = useRef(null);
  const recordSupported = isRecordingSupported();

  // Refs that mirror the live overlay state so the recorder's per-frame
  // composite tick can read up-to-date values without us re-creating the
  // recorder on every gesture. Updated below in a tiny effect.
  const overlayStateRef = useRef({ x: 0, y: 0, scale: 1, rotation: 0, flip: false, opacity: 0.55 });

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

  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      const old = streamRef.current;
      if (old) old.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setTorchSupported(false);
      setTorchOn(false);

      // Best-quality video + clean audio. Echo cancellation, noise
      // suppression, and AGC are enabled explicitly so the captured audio
      // is voice rather than room reverb. If the user denies the mic
      // prompt we silently fall back to video-only — /trace doesn't use
      // audio locally (the local <video> is muted) so losing it has zero
      // user-visible cost.
      const videoConstraints = {
        facingMode: { ideal: facingMode },
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      };
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
      };

      // mediaDevices missing entirely = in-app browser WebView (Instagram /
      // Facebook / LINE / Discord / X embedded browsers all strip the API)
      // or an ancient browser. The user may not even know they're inside
      // an in-app browser — the page loads fine, the heartbeat fires fine,
      // but the camera path is unreachable. Surface to the dashboard so
      // we don't show "they closed the tab" copy when they very much
      // didn't.
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setCameraError('Your browser blocks camera access. Open this page in Safari or Chrome instead of an in-app browser.');
        return;
      }

      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints,
        });
      } catch {
        if (!cancelled) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
              audio: false,
            });
          } catch (err2) {
            if (cancelled) return;
            setCameraError(
              err2?.name === 'NotAllowedError'
                ? 'Camera access was blocked. Allow it in your browser settings to start tracing.'
                : 'Could not start the camera. Try a different browser or device.'
            );
            return;
          }
        }
      }

      if (cancelled || !stream) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities();
        if (caps?.torch) setTorchSupported(true);
      }
      setCameraError('');
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
    // setPointerCapture can throw on Safari/iOS if the pointer was already
    // captured elsewhere or the event target is detached. Failing capture
    // just means move events route by hit-testing instead of by pointerId,
    // which is fine for a single-finger drag — don't abort the whole gesture.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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
  // Flips true the first time a recording is saved in this session; read on
  // close so end_trace_run can mark the run (and the user's recorded-session
  // count) as having produced a saved clip.
  const recordedRef   = useRef(false);
  const accessTokenRef = useRef(null);
  useEffect(() => {
    accessTokenRef.current = session?.access_token || null;
  }, [session?.access_token]);
  useEffect(() => {
    if (!imageUrl) return;
    if (!user?.id) return;
    endedRef.current = false;
    runIdRef.current = null;
    recordedRef.current = false;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const haveSupabaseEnv = !!(supabaseUrl && anonKey);

    // Tell the AuthProvider's presence stream we're in the trace studio
    // even before the run RPC lands — that way the next 60s heartbeat
    // reflects the user's actual page even if start_trace_run fails.
    setPresence('trace', imageLabel);

    // Lock the auto-update poller out of reloading mid-session. Cleared
    // in finish() below on every exit path.
    setTracing(true);

    // Server-authoritative count. start_trace_run RPC inserts a
    // trace_session_runs row + bumps profiles.trace_sessions; AuthProvider's
    // realtime subscription pushes the new profile row to the client, which
    // updates the /account stats grid the next render.
    if (!startedRef.current) {
      startedRef.current = true;

      const accessToken = accessTokenRef.current;
      if (haveSupabaseEnv && accessToken) {
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
              // start_trace_run returns either a bare uuid (legacy) or an
              // object { run_id, ... } — accept both.
              if (typeof data === 'string' && data.length === 36) {
                runIdRef.current = data;
              } else if (data && typeof data === 'object') {
                if (typeof data.run_id === 'string' && data.run_id.length === 36) {
                  runIdRef.current = data.run_id;
                }
              }
            })
            .catch(() => { /* silent — operator-side RPC, user shouldn't see noise */ });
        } catch { /* silent */ }
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
      setTracing(false);

      const runId = runIdRef.current;

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
          body: JSON.stringify({ p_run_id: runId, p_reason: reason, p_recorded: recordedRef.current }),
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
    // See onHandleDown — capture failures shouldn't kill the gesture.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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

  // Mirror the live overlay state into a ref so the recorder's per-frame
  // composite tick can read the current transform/opacity without the
  // recorder being recreated on every gesture.
  useEffect(() => {
    overlayStateRef.current = {
      x: transform.x,
      y: transform.y,
      scale: transform.scale,
      rotation: transform.rotation,
      flip: transform.flip,
      opacity: flickerOn ? flickerOpacity : opacity,
    };
  }, [transform, opacity, flickerOn, flickerOpacity]);

  // 1Hz timer while recording — drives the REC chip in the topbar.
  useEffect(() => {
    if (!recording) return;
    setRecordSecs(0);
    const startedAt = Date.now();
    const id = setInterval(() => {
      setRecordSecs(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      const stopper = recordStopperRef.current;
      recordStopperRef.current = null;
      setRecording(false);
      if (stopper) {
        try { await stopper.stop(); } catch (err) { console.warn('[trace] stop record failed:', err); }
      }
      return;
    }
    if (!recordSupported) {
      setRecordError('Recording is not supported in this browser.');
      return;
    }
    const stream = streamRef.current;
    if (!stream) {
      setRecordError('Camera is not ready yet.');
      return;
    }
    try {
      const handle = startRecording({
        mode: recordIncludeOverlay ? 'composite' : 'camera',
        sourceStream: stream,
        videoEl: videoRef.current,
        overlayEl: overlayRef.current,
        getOverlayState: () => overlayStateRef.current,
        onSaved: () => { recordedRef.current = true; },
      });
      recordStopperRef.current = handle;
      setRecording(true);
      setRecordError('');
    } catch (err) {
      console.warn('[trace] start record failed:', err);
      setRecordError(err?.message || 'Could not start recording.');
    }
  }, [recording, recordIncludeOverlay, recordSupported]);

  // Idle timer. Reset on pointerdown / wheel / keydown anywhere on the
  // page; fires after 10s of quiet to dim the chrome.
  useEffect(() => {
    let timerId = null;
    const IDLE_MS = 10_000;
    const arm = () => {
      setIdle(false);
      if (timerId) clearTimeout(timerId);
      timerId = setTimeout(() => setIdle(true), IDLE_MS);
    };
    arm();
    const opts = { passive: true, capture: true };
    window.addEventListener('pointerdown', arm, opts);
    window.addEventListener('wheel',       arm, opts);
    window.addEventListener('keydown',     arm, opts);
    return () => {
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('pointerdown', arm, opts);
      window.removeEventListener('wheel',       arm, opts);
      window.removeEventListener('keydown',     arm, opts);
    };
  }, []);

  // Make sure recording stops if the studio is unmounted mid-take.
  useEffect(() => {
    return () => {
      const stopper = recordStopperRef.current;
      recordStopperRef.current = null;
      if (stopper) { try { stopper.stop(); } catch { /* ignore */ } }
    };
  }, []);

  const formatRecTime = (s) => {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return `${mm}:${ss.toString().padStart(2, '0')}`;
  };

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
    <div className={`trace-stage ${idle ? 'is-idle' : ''}`}>
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
          Stop
        </button>
        <div className="trace-brand" aria-hidden="true">
          <img src="/images/brand/logo-icon.webp" alt="" className="trace-brand-icon" />
          <span className="trace-brand-domain">tracemate.art</span>
        </div>
        {recording && (
          <div className="trace-rec-chip" role="status" aria-live="polite">
            <span className="trace-rec-dot" aria-hidden="true" />
            <span>REC {formatRecTime(recordSecs)}</span>
          </div>
        )}
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
      <footer className={`trace-dock ${controlsHidden ? 'is-hidden' : ''}`}>
        {/* Chevron handle — points up when hidden ("tap to expand"), down
            when shown ("tap to collapse"). Big tap target. */}
        <button
          type="button"
          className="trace-dock-handle"
          onClick={() => setControlsHidden((v) => !v)}
          aria-label={controlsHidden ? 'Show controls' : 'Hide controls'}
          aria-expanded={!controlsHidden}
        >
          <svg
            className="trace-dock-handle-icon"
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
          <div className="trace-dock-body">
            {recordError && (
              <div className="trace-rec-error" role="alert">{recordError}</div>
            )}

            {/* Segmented tab control. Three modes; switching is instant. */}
            <div className="trace-dock-tabs" role="tablist" aria-label="Adjust mode">
              {[
                { id: 'opacity', label: 'Opacity' },
                { id: 'adjust',  label: 'Adjust'  },
                { id: 'flicker', label: 'Flicker' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === t.id}
                  className={`trace-dock-tab ${panelTab === t.id ? 'is-active' : ''}`}
                  onClick={() => setPanelTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Slider region — re-renders per tab, height adapts. */}
            <div className="trace-dock-panel">
              {panelTab === 'opacity' && (
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
              )}

              {panelTab === 'adjust' && (
                <div className="trace-slider-grid">
                  {/* Move X — bounds chosen to comfortably cover any
                      typical phone/tablet viewport without a hard wall. */}
                  <div className="trace-slider trace-slider-compact">
                    <span className="trace-slider-label" aria-hidden="true">X</span>
                    <input
                      type="range"
                      min={-600}
                      max={600}
                      step={1}
                      value={Math.round(transform.x)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setTransform((t) => ({ ...t, x: v }));
                      }}
                      aria-label="Move horizontally"
                      style={{ '--tm-slider-fill': `${((transform.x + 600) / 1200) * 100}%` }}
                    />
                    <span className="trace-slider-value">{Math.round(transform.x)}</span>
                  </div>
                  <div className="trace-slider trace-slider-compact">
                    <span className="trace-slider-label" aria-hidden="true">Y</span>
                    <input
                      type="range"
                      min={-600}
                      max={600}
                      step={1}
                      value={Math.round(transform.y)}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setTransform((t) => ({ ...t, y: v }));
                      }}
                      aria-label="Move vertically"
                      style={{ '--tm-slider-fill': `${((transform.y + 600) / 1200) * 100}%` }}
                    />
                    <span className="trace-slider-value">{Math.round(transform.y)}</span>
                  </div>
                  {/* Zoom — same 0.2..8 bounds as gesture pinch (see
                      onPointerMove). Stepped at 0.01 for fine control. */}
                  <div className="trace-slider trace-slider-compact">
                    <span className="trace-slider-label" aria-hidden="true">Zoom</span>
                    <input
                      type="range"
                      min={0.2}
                      max={8}
                      step={0.01}
                      value={transform.scale}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        setTransform((t) => ({ ...t, scale: v }));
                      }}
                      aria-label="Zoom"
                      style={{ '--tm-slider-fill': `${((transform.scale - 0.2) / 7.8) * 100}%` }}
                    />
                    <span className="trace-slider-value">{transform.scale.toFixed(2)}×</span>
                  </div>
                  {/* Rotate — gestures can push rotation past ±180 (no
                      modulo); the slider clamps when used. Display in
                      degrees, normalized into the slider's range so a
                      "spun" overlay still has a sensible thumb position. */}
                  <div className="trace-slider trace-slider-compact">
                    <span className="trace-slider-label" aria-hidden="true">Rotate</span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      step={1}
                      value={Math.max(-180, Math.min(180, Math.round(transform.rotation)))}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setTransform((t) => ({ ...t, rotation: v }));
                      }}
                      aria-label="Rotate"
                      style={{ '--tm-slider-fill': `${((Math.max(-180, Math.min(180, transform.rotation)) + 180) / 360) * 100}%` }}
                    />
                    <span className="trace-slider-value">{Math.round(transform.rotation)}°</span>
                  </div>
                </div>
              )}

              {panelTab === 'flicker' && (
                <div className="trace-flicker-pane">
                  {/* Flicker on/off lives here so the tab is fully self-
                      contained — toggle the mode where you tune it. */}
                  <label className="trace-switch">
                    <input
                      type="checkbox"
                      checked={flickerOn}
                      onChange={(e) => setFlickerOn(e.target.checked)}
                    />
                    <span className="trace-switch-track" aria-hidden="true">
                      <span className="trace-switch-thumb" />
                    </span>
                    <span className="trace-switch-label">{flickerOn ? 'Pulsing' : 'Off'}</span>
                  </label>

                  {flickerOn && (
                    <>
                      <div className="trace-slider trace-slider-compact">
                        <span className="trace-slider-label" aria-hidden="true">Speed</span>
                        <input
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
                      <div className="trace-slider trace-slider-compact">
                        <span className="trace-slider-label" aria-hidden="true">Min</span>
                        <input
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
                      <div className="trace-slider trace-slider-compact">
                        <span className="trace-slider-label" aria-hidden="true">Max</span>
                        <input
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
                </div>
              )}
            </div>

            {/* Compact actions row. Center moved out of here into the
                Adjust tab is tempting but a one-tap recenter is the most
                common shortcut, so it stays. Flicker moved out — it
                lives in the Flicker tab now. */}
            <div className="trace-dock-actions">
              <button
                type="button"
                className="trace-icon-btn"
                onClick={recenter}
                aria-label="Recenter overlay"
                title="Center"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="10" cy="10" r="6.5" />
                  <circle cx="10" cy="10" r="1.4" fill="currentColor" />
                  <path d="M10 1.5 V4 M10 16 V18.5 M1.5 10 H4 M16 10 H18.5" />
                </svg>
              </button>
              <button
                type="button"
                className="trace-icon-btn"
                onClick={flipHorizontal}
                aria-label="Flip horizontally"
                title="Flip"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M10 3 V17" strokeDasharray="2 2" />
                  <path d="M3 6 L8 6 L8 14 L3 14 Z" />
                  <path d="M17 6 L12 6 L12 14 L17 14 Z" fill="currentColor" fillOpacity="0.25" />
                </svg>
              </button>
              <button
                type="button"
                className={`trace-icon-btn ${warpMode ? 'is-active' : ''}`}
                onClick={() => setWarpMode((v) => !v)}
                aria-pressed={warpMode}
                aria-label={warpMode ? 'Exit warp mode' : 'Enter warp mode'}
                title="Warp"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3.5 4 L16 5 L17 16 L4.5 14.5 Z" />
                  <circle cx="3.5" cy="4"   r="1.4" fill="currentColor" />
                  <circle cx="16"  cy="5"   r="1.4" fill="currentColor" />
                  <circle cx="17"  cy="16"  r="1.4" fill="currentColor" />
                  <circle cx="4.5" cy="14.5" r="1.4" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                className="trace-icon-btn"
                onClick={switchCamera}
                aria-label="Switch camera"
                title="Camera"
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6.5 H6 L7.5 5 H12.5 L14 6.5 H17 a1 1 0 0 1 1 1 V15 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V7.5 a1 1 0 0 1 1 -1 Z" />
                  <path d="M10 9.5 a2 2 0 1 0 2 2" />
                  <path d="M12 9.5 V8 H10.5" />
                </svg>
              </button>
              {torchSupported && (
                <button
                  type="button"
                  className={`trace-icon-btn ${torchOn ? 'is-active' : ''}`}
                  onClick={toggleTorch}
                  aria-pressed={torchOn}
                  aria-label={torchOn ? 'Turn flash off' : 'Turn flash on'}
                  title="Flash"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2 L4.5 11 H9.5 L8 18 L15.5 9 H10.5 L12 2 Z" />
                  </svg>
                </button>
              )}
              {recordSupported && (
                <button
                  type="button"
                  className={`trace-icon-btn trace-rec-btn ${recording ? 'is-recording' : ''}`}
                  onClick={toggleRecording}
                  aria-pressed={recording}
                  aria-label={recording ? 'Stop recording' : 'Start recording'}
                  title={recording ? 'Stop' : 'Record'}
                >
                  {recording ? (
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <rect x="5" y="5" width="10" height="10" rx="1.5" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                         strokeWidth="1.7" aria-hidden="true">
                      <circle cx="10" cy="10" r="7" />
                      <circle cx="10" cy="10" r="3.4" fill="currentColor" stroke="none" />
                    </svg>
                  )}
                </button>
              )}
            </div>

            {recordSupported && !recording && (
              <label className="trace-checkbox trace-checkbox-mini">
                <input
                  type="checkbox"
                  checked={recordIncludeOverlay}
                  onChange={(e) => setRecordIncludeOverlay(e.target.checked)}
                />
                <span className="trace-checkbox-box" aria-hidden="true">
                  <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor"
                       strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 7.5 L6 11 L11.5 3.5" />
                  </svg>
                </span>
                <span className="trace-checkbox-label">Record overlay</span>
              </label>
            )}
          </div>
        )}
      </footer>
    </div>
  );
}
