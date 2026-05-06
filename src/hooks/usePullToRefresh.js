import { useEffect, useRef, useState } from 'react';

/**
 * Pull-to-refresh on touch / mouse: drag down from the top of the page
 * past a threshold to fire `onRefresh`. Returns `{ pullDistance, triggered,
 * isRefreshing }` so the caller can render whatever indicator they want.
 *
 * Why a custom hook (vs a library)? The behaviour is ~70 lines and
 * libraries tend to bring their own DOM helpers that fight React. We
 * only need the gesture; the visual is up to the caller.
 *
 * Behaviour:
 *   - Only engages when the page is scrolled to the very top.
 *   - Tracks both touch (mobile/PWA) and mouse (desktop testing).
 *   - Past `threshold` px of pulldown, releasing fires onRefresh().
 *   - Locks during refresh so a fast double-pull doesn't fire twice.
 *   - Doesn't preventDefault until the drag is clearly vertical, so
 *     we never hijack horizontal swipes or normal clicks.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  maxPull   = 120,
  enabled   = true,
} = {}) {
  // pullDistance lives in state so the caller re-renders. distanceRef
  // mirrors it so the touch handlers (which capture closures) can read
  // the latest value without re-binding listeners every change.
  const [pullDistance, setPullDistance] = useState(0);
  const distanceRef    = useRef(0);
  const refreshingRef  = useRef(false);
  const [refreshTick, setRefreshTick] = useState(0); // forces re-render on refresh transitions

  const writeDistance = (v) => {
    distanceRef.current = v;
    setPullDistance(v);
  };

  useEffect(() => {
    if (!enabled) return;

    const isAtTop = () =>
      (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    let startY = null;
    let committed = false; // once true, the drag is a pull-to-refresh

    const onStart = (clientY) => {
      if (refreshingRef.current) return;
      if (!isAtTop()) return;
      startY = clientY;
      committed = false;
    };

    const onMove = (clientY, e) => {
      if (refreshingRef.current || startY == null) return;
      const dy = clientY - startY;

      // Don't engage until the user has clearly chosen "down". Tiny
      // accidental movements during a tap shouldn't trigger.
      if (!committed) {
        if (dy > 8 && isAtTop()) committed = true;
        else if (dy < -8) { startY = null; return; }
        else return;
      }

      if (!isAtTop()) {
        // Page started scrolling — abandon the pull cleanly.
        startY = null;
        committed = false;
        writeDistance(0);
        return;
      }

      // Damped — pulling 200px gives ~110px of indicator. Feels rubbery
      // and stops the user from dragging the indicator off-screen.
      const damped = Math.min(maxPull, Math.max(0, dy * 0.55));
      writeDistance(damped);

      // Eat the touchmove so iOS doesn't also try to overscroll.
      if (e?.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      if (refreshingRef.current) return;
      const distance = distanceRef.current;
      const wasCommitted = committed;
      startY = null;
      committed = false;

      if (wasCommitted && distance >= threshold) {
        refreshingRef.current = true;
        // Snap to threshold so the user sees their pull "stuck" while
        // the data refreshes.
        writeDistance(threshold);
        setRefreshTick((n) => n + 1);
        Promise.resolve(onRefresh?.())
          .catch(() => { /* surface up to caller */ })
          .finally(() => {
            refreshingRef.current = false;
            setRefreshTick((n) => n + 1);
            writeDistance(0);
          });
      } else {
        writeDistance(0);
      }
    };

    const onTouchStart = (e) => onStart(e.touches[0].clientY);
    const onTouchMove  = (e) => onMove(e.touches[0].clientY, e);
    const onTouchEnd   = () => onEnd();

    let mouseDown = false;
    const onMouseDown = (e) => { mouseDown = true; onStart(e.clientY); };
    const onMouseMove = (e) => { if (mouseDown) onMove(e.clientY, e); };
    const onMouseUp   = () => { if (mouseDown) { mouseDown = false; onEnd(); } };

    document.addEventListener('touchstart',  onTouchStart, { passive: true });
    document.addEventListener('touchmove',   onTouchMove,  { passive: false });
    document.addEventListener('touchend',    onTouchEnd,   { passive: true });
    document.addEventListener('touchcancel', onTouchEnd,   { passive: true });
    document.addEventListener('mousedown',   onMouseDown);
    document.addEventListener('mousemove',   onMouseMove);
    document.addEventListener('mouseup',     onMouseUp);

    return () => {
      document.removeEventListener('touchstart',  onTouchStart);
      document.removeEventListener('touchmove',   onTouchMove);
      document.removeEventListener('touchend',    onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
      document.removeEventListener('mousedown',   onMouseDown);
      document.removeEventListener('mousemove',   onMouseMove);
      document.removeEventListener('mouseup',     onMouseUp);
    };
  }, [enabled, threshold, maxPull, onRefresh]);

  return {
    pullDistance,
    isRefreshing: refreshingRef.current,
    threshold,
    triggered: pullDistance >= threshold,
    // refreshTick consumed implicitly so the hook re-renders the caller
    // when the refresh state flips. Reading it here keeps it in scope.
    _tick: refreshTick,
  };
}
