import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal focus management. Attach the returned ref to the dialog
 * container. While `active`:
 *   - moves focus into the dialog on open,
 *   - keeps Tab / Shift+Tab cycling inside it (no escaping to the page behind),
 *   - restores focus to the element that opened it on close.
 *
 * Escape-to-close stays in each modal (they already handle it).
 */
export function useFocusTrap(active = true) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const previouslyFocused = document.activeElement;
    if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');

    const items = () =>
      Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement,
      );

    // Initial focus — first control, else the container itself.
    (items()[0] || node).focus?.();

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return;
      const f = items();
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // Restore focus to the opener so keyboard users aren't dumped at the top.
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
