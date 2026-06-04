import { useEffect, useRef } from 'react';
import { trackEvent } from '../lib/track.js';

/**
 * Fire a one-time `section` view event when an element first scrolls into
 * view. Powers the funnel question "how many visitors actually reach
 * <section>?" (e.g. pricing) instead of guessing from coarse scroll-depth.
 *
 * Usage:  const ref = useSectionView('pricing');  <section ref={ref} …>
 */
export function useSectionView(id, threshold = 0.4) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let fired = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !fired) {
          fired = true;
          trackEvent('section', { id });
          io.disconnect();
        }
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [id, threshold]);
  return ref;
}
