import { useCallback, useRef } from 'react';

// Pointer-driven slider. Maps the pointer's X directly to a value across the
// track, so a tap jumps to the finger and dragging tracks it at any speed —
// fixing the native <input type=range> "stuck thumb" on mobile WebViews.
export default function TraceSlider({
  value, min, max, step = 0.01, onChange,
  ariaLabel, disabled = false, className = '',
}) {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);

  const valueFromX = useCallback((clientX) => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return value;
    let frac = (clientX - rect.left) / rect.width;
    frac = Math.max(0, Math.min(1, frac));
    let v = min + frac * (max - min);
    if (step > 0) v = Math.round((v - min) / step) * step + min;
    return Math.max(min, Math.min(max, v));
  }, [min, max, step, value]);

  const emit = useCallback((clientX) => {
    const v = valueFromX(clientX);
    // Avoid redundant updates (and float noise) when the value didn't change.
    if (v !== value) onChange(v);
  }, [valueFromX, onChange, value]);

  const down = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    emit(e.clientX);
  }, [disabled, emit]);

  const move = useCallback((e) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    emit(e.clientX);
  }, [emit]);

  const up = useCallback((e) => {
    draggingRef.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  }, []);

  const onKeyDown = useCallback((e) => {
    if (disabled) return;
    const big = (max - min) / 10;
    let v = value;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + step;
    else if (e.key === 'Home') v = min;
    else if (e.key === 'End') v = max;
    else if (e.key === 'PageUp') v = value + big;
    else if (e.key === 'PageDown') v = value - big;
    else return;
    e.preventDefault();
    onChange(Math.max(min, Math.min(max, v)));
  }, [disabled, value, min, max, step, onChange]);

  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div
      ref={trackRef}
      className={`tm-slider ${disabled ? 'is-disabled' : ''} ${className}`}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Number(value.toFixed ? value.toFixed(3) : value)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={onKeyDown}
    >
      <div className="tm-slider-rail" aria-hidden="true">
        <div className="tm-slider-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="tm-slider-thumb" aria-hidden="true" style={{ left: `${pct}%` }} />
    </div>
  );
}
