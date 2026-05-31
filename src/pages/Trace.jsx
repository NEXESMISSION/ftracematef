import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLocalState } from '../lib/useLocalState.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { loadPendingImage } from '../lib/pendingImage.js';
import { consumeFreeSession, trialAlreadyConsumedThisVisit } from '../lib/freeTrial.js';
import { setPresence, clearPresence } from '../lib/presence.js';
import { setTracing } from '../lib/tracing-state.js';
import { supabase } from '../lib/supabase.js';
import { publishCreation } from '../lib/creations.js';
import { startRecording, isRecordingSupported } from '../lib/recorder.js';
import ExitSurvey from '../components/ExitSurvey.jsx';
import TraceSlider from '../components/TraceSlider.jsx';
import CameraCapture from '../components/CameraCapture.jsx';
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
  const { user, profile, session, refresh, isPaid } = useAuth();

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

  // ── Imperative gesture pipeline ──────────────────────────────────────────
  // The overlay transform is written DIRECTLY to the DOM node during a gesture
  // (drag / pinch / rotate), throttled to one write per animation frame, so a
  // finger move never triggers a React re-render. React state (`transform`) is
  // synced only once, on release. Without this the whole 1250-line component
  // re-rendered on every pointermove — the source of the lag/jank.
  //
  // liveTransformRef holds the authoritative transform DURING a gesture (state
  // lags until commit); transformRef mirrors committed state so the deps-free
  // pointer handlers read the freshest value; warpMatrixRef carries the warp
  // suffix so imperative writes match what React would render.
  const liveTransformRef = useRef(null);
  const transformRef     = useRef(INITIAL_TRANSFORM);
  const warpMatrixRef    = useRef('');
  const handlesWrapRef   = useRef(null);
  const rafIdRef         = useRef(null);
  const hintDismissedRef = useRef(false);
  // True from pointerdown until the first scheduleApply of a gesture, so that
  // first move is written to the DOM SYNCHRONOUSLY (zero perceived latency);
  // every subsequent move coalesces to the next animation frame.
  const firstMoveRef     = useRef(false);

  const [transform, setTransform]           = useState(INITIAL_TRANSFORM);
  // Persisted across sessions via localStorage so the studio remembers your setup.
  const [opacity, setOpacity]               = useLocalState('tm:opacity', 0.55);
  const [facingMode, setFacingMode]         = useLocalState('tm:facingMode',  'environment'); // 'environment' | 'user'
  const [cameraError, setCameraError]       = useState('');
  const [showHint, setShowHint]             = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn]               = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  // Bottom dock "More" sheet — secondary controls (pulse / warp / camera /
  // flash / record-overlay) live here so the main dock stays simple and the
  // primary actions can stay big. Closed on each fresh visit.
  const [moreOpen, setMoreOpen] = useState(false);
  // Camera options popup (back / front + flash), opened from the Camera button.
  const [cameraMenu, setCameraMenu] = useState(false);
  // Real list of the device's video inputs, filled in after camera permission
  // is granted (labels are blank before that). selectedCameraId pins the stream
  // to one exact device; activeCameraId mirrors whichever camera actually
  // opened, so the menu can highlight the live one.
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [activeCameraId, setActiveCameraId] = useState(null);
  // B2 streak — celebration popup shown when today's first trace lands.
  const [streakInfo, setStreakInfo] = useState(null);
  const streakDoneRef = useRef(false);
  // C2 publish — "show off your result" flow shown when ending a session.
  const [exitPrompt, setExitPrompt] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState('');
  const [noteText, setNoteText] = useState('');    // C2 caption for the shared result
  // C2 privacy: whether to ALSO share the reference image they traced. Default
  // OFF — the source image is private unless they explicitly opt in.
  const [shareReference, setShareReference] = useState(false);
  const [camOpen, setCamOpen] = useState(false);   // C2 camera-capture modal
  // After a photo is captured, hold it for a compact compose step (preview +
  // note + share) before it actually posts — { file, url } | null.
  const [pendingShot, setPendingShot] = useState(null);
  // Help / onboarding overlay. Auto-shown the first time a user opens /trace
  // (gated by the 'tm:trace-tutorial-seen' localStorage flag, set on dismiss);
  // re-openable any time via the topbar "?" button.
  const [showHelp, setShowHelp]             = useState(false);
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
  // (default; cheapest to render), 'flicker' = the pulse-mode panel.
  // Stored locally so a tab refresh doesn't dump the user back into
  // Opacity mid-tracing.
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
  // Tapping Record opens this Yes/No popup asking whether to bake the
  // reference overlay into the clip — replaces the old persistent checkbox.
  const [recordPrompt, setRecordPrompt] = useState(false);
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

  // B2 — daily streak. Once per studio visit, tell the server we traced today
  // (passing the LOCAL date so the streak respects the user's timezone). The
  // server is idempotent per day; it only advances on the first trace of a new
  // day, and returns { incremented } so we know when to celebrate. Updating
  // profiles also flows back through AuthProvider's realtime sub for /account.
  useEffect(() => {
    if (!imageUrl || !user?.id || streakDoneRef.current) return;
    streakDoneRef.current = true;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    supabase.rpc('record_trace_day', { p_today: today }).then(
      ({ data, error }) => {
        if (error || !data) return;
        if (data.incremented) {
          setStreakInfo({ current: data.current_streak, longest: data.longest_streak });
          refresh();
        }
      },
      () => { /* streak is best-effort — never block tracing on it */ },
    );
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
      // Pin to a specific camera when the user picked one from the menu;
      // otherwise fall back to the front/back hint.
      const videoConstraints = selectedCameraId
        ? {
            deviceId: { exact: selectedCameraId },
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
          }
        : {
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
      // Record which camera actually opened so the menu can highlight it.
      const settings = track && typeof track.getSettings === 'function' ? track.getSettings() : null;
      if (settings?.deviceId && !cancelled) setActiveCameraId(settings.deviceId);
      // Permission is granted now, so device labels are available — list the
      // real cameras the user can switch between (best-effort).
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setCameras(
            devices
              .filter((d) => d.kind === 'videoinput')
              .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` })),
          );
        }
      } catch { /* ignore — listing cameras is best-effort */ }
      setCameraError('');
    }

    startCamera();
    return () => {
      cancelled = true;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facingMode, selectedCameraId]);

  // Auto-hide the gesture hint after a moment
  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 4500);
    return () => clearTimeout(t);
  }, []);

  // The move/zoom/rotate tab was removed (its sliders are replaced by the
  // touch gestures + action buttons). A user whose persisted panelTab is
  // still the removed id would otherwise land on a now-nonexistent tab —
  // coerce it back to a valid tab.
  useEffect(() => {
    if (panelTab !== 'opacity' && panelTab !== 'flicker') setPanelTab('opacity');
  }, [panelTab, setPanelTab]);

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

  // Survey gate: show the one-question survey modal on the SECOND /trace
  // visit onward. We capture trace_sessions ONCE — the first time profile
  // is non-null — so realtime updates that bump trace_sessions to 1 DURING
  // the user's first session don't trigger the modal mid-trace. The image
  // is preserved either way because the modal sits on top of <Trace />
  // rather than replacing it (so pendingImage / imageUrl never unmount).
  const initialTraceSessionsRef = useRef(null);
  if (initialTraceSessionsRef.current === null && profile) {
    initialTraceSessionsRef.current = Number(profile.trace_sessions ?? 0);
  }
  const [surveyDismissed, setSurveyDismissed] = useState(false);
  const showSurveyModal =
    initialTraceSessionsRef.current !== null
    && initialTraceSessionsRef.current >= 1
    && profile?.survey_completed_at == null
    && !surveyDismissed;
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
  // All three handlers are dependency-free (deps: []) and read live values from
  // refs, so React never recreates them and never re-renders mid-gesture.

  // Build the exact transform string React would render, so imperative writes
  // are pixel-identical to the state-driven path (no jump on commit).
  const buildOverlayTransform = useCallback((t) => (
    `translate(-50%, -50%) ` +
    `translate(${t.x}px, ${t.y}px) ` +
    `scale(${t.flip ? -t.scale : t.scale}, ${t.scale}) ` +
    `rotate(${t.rotation}deg)` +
    (warpMatrixRef.current ? ` ${warpMatrixRef.current}` : '')
  ), []);

  const buildHandlesTransform = useCallback((t) => (
    `translate(${t.x}px, ${t.y}px) ` +
    `scale(${t.flip ? -t.scale : t.scale}, ${t.scale}) ` +
    `rotate(${t.rotation}deg)`
  ), []);

  // Schedule a single DOM write for the next frame. Repeated calls within one
  // frame coalesce — the last transform wins, so a 120Hz trackpad or a flood
  // of coalesced pointer events still costs at most one style write per frame.
  const writeLiveTransform = useCallback(() => {
    const cur = liveTransformRef.current;
    if (!cur) return;
    const el = overlayRef.current;
    if (el) el.style.transform = buildOverlayTransform(cur);
    const hw = handlesWrapRef.current;
    if (hw) hw.style.transform = buildHandlesTransform(cur);
  }, [buildOverlayTransform, buildHandlesTransform]);

  const scheduleApply = useCallback((t) => {
    liveTransformRef.current = t;
    // Keep the recorder's per-frame composite in sync DURING the gesture
    // (overlayStateRef is otherwise only refreshed when state commits).
    const s = overlayStateRef.current;
    s.x = t.x; s.y = t.y; s.scale = t.scale; s.rotation = t.rotation; s.flip = t.flip;
    // FIRST move of a gesture: write to the DOM synchronously so the very first
    // finger movement has zero perceived latency. All later moves coalesce to
    // one DOM write per animation frame.
    if (firstMoveRef.current) {
      firstMoveRef.current = false;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      writeLiveTransform();
      return;
    }
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      writeLiveTransform();
    });
  }, [writeLiveTransform]);

  // Flush any pending frame and push the live transform into React state. Done
  // once, on the last finger up, so sliders / recorder / persistence all see
  // the final values.
  const commitLive = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    const t = liveTransformRef.current;
    if (!t) return;
    const el = overlayRef.current;
    if (el) el.style.transform = buildOverlayTransform(t);
    setTransform(t);
  }, [buildOverlayTransform]);

  const onPointerDown = useCallback((e) => {
    // See onHandleDown — capture failures shouldn't kill the gesture.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const wasEmpty = pointersRef.current.size === 0;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Seed the live transform from committed state on the first finger down.
    if (wasEmpty || !liveTransformRef.current) {
      liveTransformRef.current = { ...transformRef.current };
    }
    // Apply the next move synchronously (zero first-frame latency). We must NOT
    // call setState here — a re-render at gesture-start would hitch the first
    // frame. The hint is dismissed on pointerUP instead (or by the 4.5s timer).
    firstMoveRef.current = true;
    // Drop the expensive drop-shadow while gesturing so each frame composites
    // cheaply. Toggled imperatively (no React state → no re-render).
    if (wasEmpty) {
      const node = overlayRef.current;
      if (node) node.classList.add('is-gesturing');
    }

    if (pointersRef.current.size === 1) {
      gestureRef.current = {
        type: 'drag',
        startX: e.clientX,
        startY: e.clientY,
        startTransform: { ...liveTransformRef.current },
      };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      gestureRef.current = {
        type: 'pinch',
        startDist:  Math.hypot(dx, dy),
        startAngle: (Math.atan2(dy, dx) * 180) / Math.PI,
        startCx: (pts[0].x + pts[1].x) / 2,
        startCy: (pts[0].y + pts[1].y) / 2,
        startTransform: { ...liveTransformRef.current },
      };
    }
  }, []);

  // Rotation deadzone (degrees). A pinch is usually meant as pure zoom, but
  // tiny finger jitter spins the overlay and reads as "rotation is too
  // twitchy/fast". We ignore the first few degrees, then track 1:1 with no
  // jump, so deliberate twists still feel natural.
  const ROTATE_DEADZONE = 5;

  const onPointerMove = useCallback((e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const g = gestureRef.current;
    if (!g) return;

    if (g.type === 'drag' && pointersRef.current.size === 1) {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      scheduleApply({
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
      let dAngle = angle - g.startAngle;
      if (Math.abs(dAngle) <= ROTATE_DEADZONE) dAngle = 0;
      else dAngle -= Math.sign(dAngle) * ROTATE_DEADZONE;
      // Centroid panning: the overlay follows the midpoint of the two fingers
      // so scale + rotation + translation all apply together in one frame
      // (standard pinch-zoom-pan).
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      scheduleApply({
        ...g.startTransform,
        scale,
        rotation: g.startTransform.rotation + dAngle,
        x: g.startTransform.x + (cx - g.startCx),
        y: g.startTransform.y + (cy - g.startCy),
      });
    }
  }, [scheduleApply]);

  const onPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      // Last finger up — restore the drop-shadow and sync React state to the
      // final live transform.
      const node = overlayRef.current;
      if (node) node.classList.remove('is-gesturing');
      commitLive();
      // Defer the hint dismissal to gesture END so it never causes a re-render
      // during an active drag.
      if (!hintDismissedRef.current) {
        hintDismissedRef.current = true;
        setShowHint(false);
      }
    } else if (pointersRef.current.size === 1) {
      // Switching from pinch back to drag — re-anchor against the LIVE
      // transform (state hasn't committed yet) so there's no snap.
      const remaining = Array.from(pointersRef.current.values())[0];
      gestureRef.current = {
        type: 'drag',
        startX: remaining.x,
        startY: remaining.y,
        startTransform: { ...(liveTransformRef.current ?? transformRef.current) },
      };
      firstMoveRef.current = true;
    }
  }, [commitLive]);

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

  // Tapping Record while idle opens the overlay Yes/No popup; tapping while
  // recording stops and saves. The capture itself starts in beginRecording,
  // once the user has chosen whether to include the overlay.
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
    if (!streamRef.current) {
      setRecordError('Camera is not ready yet.');
      return;
    }
    setRecordError('');
    setRecordPrompt(true);
  }, [recording, recordSupported]);

  // Start the capture with the overlay choice from the popup.
  const beginRecording = useCallback((includeOverlay) => {
    setRecordPrompt(false);
    const stream = streamRef.current;
    if (!stream) {
      setRecordError('Camera is not ready yet.');
      return;
    }
    try {
      const handle = startRecording({
        mode: includeOverlay ? 'composite' : 'camera',
        sourceStream: stream,
        videoEl: videoRef.current,
        overlayEl: overlayRef.current,
        getOverlayState: () => overlayStateRef.current,
        watermark: !isPaid, // A2 — free recordings carry the Trace Mate mark
        onSaved: () => { recordedRef.current = true; },
      });
      recordStopperRef.current = handle;
      setRecording(true);
      setRecordError('');
    } catch (err) {
      console.warn('[trace] start record failed:', err);
      setRecordError(err?.message || 'Could not start recording.');
    }
  }, [isPaid]);

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

  // Actually tear down the camera and leave. `to` defaults to /upload (used by
  // Skip and the camera-error screen); a successful publish passes '/account'
  // so the user lands on their home page and can see their new creation.
  const doExit = (to = '/upload') => {
    const stream = streamRef.current;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    navigate(to);
  };

  // Stop button → offer to publish the result first (C2). The actual exit
  // happens via doExit() once they publish or skip.
  const exitTrace = () => {
    setPublishMsg('');
    setExitPrompt(true);
  };

  // C2 — a photo was captured by the camera. Move to the compose step rather
  // than posting straight away, so the user can add a note / choose to show the
  // reference with the result in front of them.
  const onShotCaptured = (file) => {
    setCamOpen(false);
    if (!file) return;
    setPendingShot({ file, url: URL.createObjectURL(file) });
  };

  // Discard the captured shot and return to the studio.
  const cancelCompose = () => {
    if (pendingShot?.url) URL.revokeObjectURL(pendingShot.url);
    setPendingShot(null);
    setPublishMsg('');
  };

  // C2 — actually publish the composed post (photo + note + optional reference).
  const onPost = async () => {
    if (!pendingShot || !user?.id) return;
    setPublishing(true);
    setPublishMsg('Publishing…');
    try {
      await publishCreation({
        file: pendingShot.file,
        // Only attach the traced reference if the user opted in (privacy).
        reference: shareReference ? (imageUrl || null) : null,
        note: noteText,
        userId: user.id,
        watermark: !isPaid,
      });
      // Mark this run as having produced a saved result, like a recording does.
      recordedRef.current = true;
      setPublishMsg('Published! 🎉');
      // Land on the account page so they immediately see their new creation.
      setTimeout(() => doExit('/account'), 700);
    } catch (err) {
      console.warn('[trace] publish failed:', err);
      setPublishMsg(err?.message || 'Could not publish. Try again.');
      setPublishing(false);
    }
  };

  // Warp suffix + ref mirrors for the imperative gesture pipeline. Computed
  // before the early return so the layout effect (a hook) stays unconditional.
  const warpMatrix =
    corners && baseSize && !isIdentity(corners, baseSize.w, baseSize.h)
      ? cssMatrix3d(baseSize.w, baseSize.h, corners)
      : '';
  transformRef.current  = transform;
  warpMatrixRef.current = warpMatrix;

  // Apply transform imperatively for every NON-gesture change (sliders, wheel,
  // recenter, flip, warp). Runs before paint (no flash). The transform is
  // deliberately NOT in the React style below, so re-renders from the flicker
  // rAF / recording timer can never reset the overlay mid-gesture.
  useLayoutEffect(() => {
    if (gestureRef.current) return; // a live gesture owns the node
    const el = overlayRef.current;
    if (el) el.style.transform = buildOverlayTransform(transform);
    const hw = handlesWrapRef.current;
    if (hw) hw.style.transform = buildHandlesTransform(transform);
    liveTransformRef.current = { ...transform };
  }, [transform, warpMatrix, buildOverlayTransform, buildHandlesTransform]);

  if (!imageUrl) return null;

  const overlayStyle = {
    opacity: flickerOn ? flickerOpacity : opacity,
    // Only opacity/filter ease here — NEVER transform, or the imperative
    // per-frame gesture writes would animate over a transition and feel laggy.
    transition: 'opacity 0.2s ease, filter 0.2s ease',
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
          <div className="warp-handles" ref={handlesWrapRef} style={handleWrapStyle}>
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
        <div className="trace-topbar-right">
          {recording && (
            <div className="trace-rec-chip" role="status" aria-live="polite">
              <span className="trace-rec-dot" aria-hidden="true" />
              <span>REC {formatRecTime(recordSecs)}</span>
            </div>
          )}
        </div>
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

            {/* Core control: opacity is the one knob you always reach for, so
                it sits front and centre. When Pulse is on the slider is swapped
                for a compact status pill (tune the pulse inside More). */}
            {flickerOn ? (
              <div className="trace-pulse-panel">
                <div className="trace-slider trace-slider-compact">
                  <span className="trace-slider-label" aria-hidden="true">Speed</span>
                  <TraceSlider
                    value={flickerSpeed}
                    min={1}
                    max={10}
                    step={0.5}
                    ariaLabel="Pulse speed"
                    onChange={(v) => setFlickerSpeed(v)}
                    className="trace-slider-input"
                  />
                  <span className="trace-slider-value">{flickerSpeed.toFixed(1)}×</span>
                </div>
                <div className="trace-slider trace-slider-compact">
                  <span className="trace-slider-label" aria-hidden="true">Amount</span>
                  <TraceSlider
                    value={flickerMax > 0 ? Math.min(1, Math.max(0, 1 - flickerMin / flickerMax)) : 0.5}
                    min={0}
                    max={1}
                    step={0.01}
                    ariaLabel="Pulse amount"
                    onChange={(a) => setFlickerMin(Math.max(0, Math.min(flickerMax - 0.01, flickerMax * (1 - a))))}
                    className="trace-slider-input"
                  />
                  <span className="trace-slider-value">{flickerMax > 0 ? Math.round((1 - flickerMin / flickerMax) * 100) : 0}%</span>
                </div>
              </div>
            ) : (
              <div className="trace-slider trace-slider-main">
                <TraceSlider
                  value={opacity}
                  min={0.05}
                  max={1}
                  step={0.01}
                  ariaLabel="Opacity"
                  onChange={setOpacity}
                  className="trace-slider-input"
                />
                <span className="trace-slider-value">{Math.round(opacity * 100)}%</span>
              </div>
            )}

            {/* Primary actions — only the few things you reach for mid-trace,
                as big targets. Everything secondary lives behind More. */}
            <div className="trace-dock-actions">
              <button
                type="button"
                className="trace-btn"
                onClick={() => setCameraMenu(true)}
                aria-label="Camera options"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 6.5 H6 L7.5 5 H12.5 L14 6.5 H17 a1 1 0 0 1 1 1 V15 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V7.5 a1 1 0 0 1 1 -1 Z" />
                  <path d="M10 9.5 a2 2 0 1 0 2 2" />
                  <path d="M12 9.5 V8 H10.5" />
                </svg>
                <span>Camera</span>
              </button>
              <button
                type="button"
                className={`trace-btn ${flickerOn ? 'is-active' : ''}`}
                onClick={() => setFlickerOn(!flickerOn)}
                aria-pressed={flickerOn}
                aria-label={flickerOn ? 'Turn pulse off' : 'Turn pulse on'}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                     strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 10 H6 L8 5 L12 15 L14 10 H18" />
                </svg>
                <span>Pulse</span>
              </button>
              {recordSupported && (
                <button
                  type="button"
                  className={`trace-btn trace-btn-rec ${recording ? 'is-recording' : ''}`}
                  onClick={toggleRecording}
                  aria-pressed={recording}
                  aria-label={recording ? 'Stop recording' : 'Start recording'}
                >
                  {recording ? (
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <rect x="5" y="5" width="10" height="10" rx="1.5" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                         strokeWidth="1.7" aria-hidden="true">
                      <circle cx="10" cy="10" r="7" />
                      <circle cx="10" cy="10" r="3.4" fill="currentColor" stroke="none" />
                    </svg>
                  )}
                  <span>{recording ? formatRecTime(recordSecs) : 'Record'}</span>
                </button>
              )}
              <button
                type="button"
                className={`trace-btn ${moreOpen ? 'is-active' : ''}`}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-label="More controls"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <circle cx="4" cy="10" r="1.6" />
                  <circle cx="10" cy="10" r="1.6" />
                  <circle cx="16" cy="10" r="1.6" />
                </svg>
                <span>More</span>
              </button>
            </div>

            {/* ── More sheet: secondary controls, revealed on demand ── */}
            {moreOpen && (
              <div className="trace-more">
                {/* Tool toggles */}
                <div className="trace-more-grid">
                  <button
                    type="button"
                    className={`trace-more-btn ${warpMode ? 'is-active' : ''}`}
                    onClick={() => setWarpMode((v) => !v)}
                    aria-pressed={warpMode}
                    aria-label={warpMode ? 'Exit warp mode' : 'Enter warp mode'}
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
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
                    className="trace-more-btn"
                    onClick={flipHorizontal}
                    aria-label="Flip horizontally"
                  >
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor"
                         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M10 3 V17" strokeDasharray="2 2" />
                      <path d="M3 6 L8 6 L8 14 L3 14 Z" />
                      <path d="M17 6 L12 6 L12 14 L17 14 Z" fill="currentColor" fillOpacity="0.25" />
                    </svg>
                    <span>Flip</span>
                  </button>
                </div>

              </div>
            )}
          </div>
        )}
      </footer>

      {showSurveyModal && (
        <div className="profile-modal trace-survey-modal" role="dialog" aria-modal="true" aria-labelledby="survey-q">
          {/* Backdrop is intentionally not click-to-close — survey is required:
              the only way out is to answer both questions and submit. */}
          <div className="profile-modal-backdrop" />
          <div className="profile-modal-card trace-survey-modal-card">
            <ExitSurvey onDone={() => setSurveyDismissed(true)} />
          </div>
        </div>
      )}

      {/* Record overlay choice — asked each time you tap Record. */}
      {recordPrompt && (
        <div className="trace-ask" role="dialog" aria-modal="true" aria-labelledby="rec-ask-title">
          <div className="trace-ask-backdrop" onClick={() => setRecordPrompt(false)} />
          <div className="trace-ask-card">
            <h3 id="rec-ask-title" className="trace-ask-title">Include the reference overlay?</h3>
            <p className="trace-ask-text">
              Record just the camera, or the camera with the traced image on top?
            </p>
            <div className="trace-ask-actions">
              <button type="button" className="trace-ask-btn" onClick={() => beginRecording(false)}>
                Camera only
              </button>
              <button type="button" className="trace-ask-btn trace-ask-btn-primary" onClick={() => beginRecording(true)}>
                With overlay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera options — pick the lens or toggle the flash. */}
      {cameraMenu && (
        <div className="trace-ask" role="dialog" aria-modal="true" aria-labelledby="cam-menu-title">
          <div className="trace-ask-backdrop" onClick={() => setCameraMenu(false)} />
          <div className="trace-ask-card">
            <h3 id="cam-menu-title" className="trace-ask-title">Camera</h3>
            <div className="trace-menu-list">
              {cameras.length > 0 ? (
                cameras.map((cam, i) => (
                  <button
                    key={cam.deviceId || i}
                    type="button"
                    className={`trace-menu-item ${cam.deviceId === activeCameraId ? 'is-active' : ''}`}
                    onClick={() => { setSelectedCameraId(cam.deviceId); setCameraMenu(false); }}
                  >
                    {cam.label}
                  </button>
                ))
              ) : (
                <>
                  {/* Fallback before the device list is known (no permission yet). */}
                  <button
                    type="button"
                    className={`trace-menu-item ${facingMode === 'environment' ? 'is-active' : ''}`}
                    onClick={() => { setSelectedCameraId(null); setFacingMode('environment'); setCameraMenu(false); }}
                  >
                    Back camera
                  </button>
                  <button
                    type="button"
                    className={`trace-menu-item ${facingMode === 'user' ? 'is-active' : ''}`}
                    onClick={() => { setSelectedCameraId(null); setFacingMode('user'); setCameraMenu(false); }}
                  >
                    Front camera
                  </button>
                </>
              )}
              {torchSupported && (
                <button
                  type="button"
                  className={`trace-menu-item ${torchOn ? 'is-active' : ''}`}
                  onClick={toggleTorch}
                >
                  Flash {torchOn ? 'On' : 'Off'}
                </button>
              )}
            </div>
            <div className="trace-ask-actions">
              <button type="button" className="trace-ask-btn" onClick={() => setCameraMenu(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C2 — simple "show off your work?" prompt when ending a session. */}
      {exitPrompt && (
        <div className="trace-ask" role="dialog" aria-modal="true" aria-labelledby="exit-title">
          <div className="trace-ask-backdrop" onClick={() => setExitPrompt(false)} />
          <div className="trace-ask-card">
            <div className="trace-streak-flame" aria-hidden="true">🎨</div>
            <h3 id="exit-title" className="trace-ask-title">Show off your work?</h3>
            <p className="trace-ask-text">
              Take a photo of your finished drawing to share it with the community.
            </p>
            <div className="trace-ask-actions">
              <button type="button" className="trace-ask-btn" onClick={() => doExit('/account')}>
                Skip
              </button>
              <button
                type="button"
                className="trace-ask-btn trace-ask-btn-primary"
                onClick={() => { setExitPrompt(false); setCamOpen(true); }}
              >
                Take a photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C2 — compose step: shown after a photo is captured. Preview + note +
          optional "show what I traced", then Post. */}
      {pendingShot && (
        <div className="trace-ask" role="dialog" aria-modal="true" aria-labelledby="compose-title">
          <div className="trace-ask-backdrop" onClick={() => !publishing && cancelCompose()} />
          <div className="trace-ask-card">
            <h3 id="compose-title" className="trace-ask-title">Share your drawing</h3>
            <img className="trace-compose-preview" src={pendingShot.url} alt="Your finished drawing" />
            <textarea
              className="trace-note-input"
              placeholder="Add a note (optional) — e.g. my first try!"
              value={noteText}
              maxLength={200}
              rows={2}
              onChange={(e) => setNoteText(e.target.value)}
              disabled={publishing}
            />
            <label className="trace-share-ref">
              <input
                type="checkbox"
                checked={shareReference}
                onChange={(e) => setShareReference(e.target.checked)}
                disabled={publishing}
              />
              <span>Also show the image I traced</span>
            </label>
            {publishMsg && <p className="trace-ask-text" style={{ fontWeight: 800 }}>{publishMsg}</p>}
            <div className="trace-ask-actions">
              <button type="button" className="trace-ask-btn" onClick={cancelCompose} disabled={publishing}>
                Cancel
              </button>
              <button type="button" className="trace-ask-btn trace-ask-btn-primary" onClick={onPost} disabled={publishing}>
                {publishing ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* C2 — real in-app camera to capture the finished drawing. */}
      <CameraCapture
        open={camOpen}
        title="Photo of your drawing"
        onClose={() => { setCamOpen(false); setExitPrompt(true); }}
        onCapture={onShotCaptured}
      />

      {/* B2 — daily streak celebration (today's first trace). */}
      {streakInfo && (
        <div className="trace-ask" role="dialog" aria-modal="true" aria-labelledby="streak-title">
          <div className="trace-ask-backdrop" onClick={() => setStreakInfo(null)} />
          <div className="trace-ask-card trace-streak-card">
            <div className="trace-streak-flame" aria-hidden="true">🔥</div>
            <h3 id="streak-title" className="trace-ask-title">
              {streakInfo.current <= 1 ? 'Streak started!' : `${streakInfo.current}-day streak!`}
            </h3>
            <p className="trace-ask-text">
              {streakInfo.current <= 1
                ? 'Come back and trace tomorrow to keep it alive.'
                : streakInfo.longest > streakInfo.current
                  ? `${streakInfo.current} days in a row — your best is ${streakInfo.longest}.`
                  : `${streakInfo.current} days in a row — a new personal best!`}
            </p>
            <div className="trace-ask-actions">
              <button type="button" className="trace-ask-btn trace-ask-btn-primary" onClick={() => setStreakInfo(null)}>
                Let's go
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
