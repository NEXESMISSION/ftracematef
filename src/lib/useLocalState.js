import { useEffect, useState } from 'react';

/**
 * useLocalState — like useState but persisted to localStorage under `key`.
 * Safe with SSR / private mode (catches storage errors).
 *
 * The stored value is validated against the *type* of `initial` before being
 * trusted — otherwise a malicious extension or stale value from a previous
 * app version could feed `setValue` something the consumer doesn't expect
 * (e.g., an opacity slider that suddenly receives an object).
 *
 * @param {string} key
 * @param {*}      initial   default value if nothing's stored yet
 */
export function useLocalState(key, initial) {
  const expectedType = Array.isArray(initial) ? 'array' : typeof initial;

  const matchesShape = (v) => {
    if (expectedType === 'array') return Array.isArray(v);
    if (expectedType === 'object') return v !== null && typeof v === 'object' && !Array.isArray(v);
    return typeof v === expectedType;
  };

  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      return matchesShape(parsed) ? parsed : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode / quota — silently ignore */
    }
  }, [key, value]);

  return [value, setValue];
}
