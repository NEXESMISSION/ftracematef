import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Progressive image for the compare popup. Shows a tiny thumbnail instantly
 * (the result's thumb is already cached from the grid; the reference now has
 * its own thumb too) and fades the full-resolution image in on top once it has
 * decoded — so the popup never shows a blank black square while a 2048px image
 * downloads. A spinner shows only until the full image is ready.
 */
function CmpImage({ thumb, full, alt }) {
  const [loaded, setLoaded] = useState(false);

  // Reset when the source changes (popup reused for a new item).
  useEffect(() => { setLoaded(false); }, [full]);

  return (
    <>
      {thumb && (
        <img
          className="cmp-img cmp-img-ph"
          src={thumb}
          alt=""
          aria-hidden="true"
          draggable={false}
          decoding="async"
        />
      )}
      {!loaded && <span className="cmp-spinner" aria-hidden="true" />}
      <img
        className={`cmp-img cmp-img-hi ${loaded ? 'is-loaded' : ''}`}
        src={full}
        alt={alt}
        draggable={false}
        decoding="async"
        fetchpriority="high"
        onLoad={() => setLoaded(true)}
        ref={(n) => { if (n && n.complete && n.naturalWidth) setLoaded(true); }}
      />
    </>
  );
}

/**
 * Full-screen popup that compares a creation's RESULT photo against the
 * REFERENCE image the user traced, using a draggable before/after slider.
 *
 * Drag the handle (or click/tap anywhere on the image) to wipe between the two.
 * Left side = reference (what they traced), right side = result (what they
 * made). If there's no reference, it just shows the result full-size.
 *
 * Props: item ({ url, thumbUrl, referenceUrl, referenceThumbUrl, author, note })
 *        | null, onClose().
 */
export default function CompareLightbox({ item, onClose }) {
  const [pos, setPos] = useState(50);   // 0..100, % revealed of the result
  const frameRef = useRef(null);
  const draggingRef = useRef(false);

  // Reset the wipe position whenever a new item opens.
  useEffect(() => { setPos(50); }, [item?.id]);

  // Close on Escape.
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const setFromClientX = useCallback((clientX) => {
    const el = frameRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    let frac = ((clientX - rect.left) / rect.width) * 100;
    frac = Math.max(0, Math.min(100, frac));
    setPos(frac);
  }, []);

  const onPointerDown = (e) => {
    draggingRef.current = true;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setFromClientX(e.clientX);
  };
  const onPointerMove = (e) => { if (draggingRef.current) setFromClientX(e.clientX); };
  const onPointerUp = () => { draggingRef.current = false; };

  if (!item) return null;
  const hasCompare = !!item.referenceUrl;

  return (
    <div className="cmp-modal" role="dialog" aria-modal="true" aria-label="Creation preview">
      <div className="cmp-backdrop" onClick={onClose} />
      <div className="cmp-card">
        <button type="button" className="cmp-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>

        {hasCompare ? (
          <div
            ref={frameRef}
            className="cmp-frame"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* Base layer: the result (what they made). */}
            <CmpImage thumb={item.thumbUrl} full={item.url} alt={`Result by ${item.author}`} />
            {/* Top layer: the reference, clipped to the left of the handle. */}
            <div className="cmp-clip" style={{ width: `${pos}%` }}>
              <div className="cmp-clip-inner">
                <CmpImage thumb={item.referenceThumbUrl} full={item.referenceUrl} alt="Reference traced" />
              </div>
            </div>

            <span className="cmp-tag cmp-tag-l">Reference</span>
            <span className="cmp-tag cmp-tag-r">Result</span>

            {/* Handle */}
            <div className="cmp-handle" style={{ left: `${pos}%` }} aria-hidden="true">
              <span className="cmp-handle-knob">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 7 L5 12 L9 17 M15 7 L19 12 L15 17" />
                </svg>
              </span>
            </div>
          </div>
        ) : (
          <div className="cmp-frame cmp-frame-single">
            <CmpImage thumb={item.thumbUrl} full={item.url} alt={`Result by ${item.author}`} />
          </div>
        )}

        <div className="cmp-meta">
          <strong>{item.author}</strong>
          {item.note && <span className="cmp-note">{item.note}</span>}
        </div>
      </div>
    </div>
  );
}
