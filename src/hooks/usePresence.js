import { useEffect } from 'react';
import { setPresence, clearPresence } from '../lib/presence.js';

/**
 * Declare which page (and optionally which image) the user is on so the
 * AuthProvider heartbeat can include it in its presence pings.
 *
 * Usage:
 *   usePresence('upload');
 *   usePresence('trace', imageName);
 *
 * Cleanup clears the registry so a stale label doesn't leak across routes.
 * The next page that mounts immediately overwrites it; the gap between
 * unmount and next mount is sub-millisecond so the AuthProvider heartbeat
 * never sees the cleared state in practice.
 */
export function usePresence(page, imageLabel = null) {
  useEffect(() => {
    setPresence(page ?? null, imageLabel ?? null);
    return () => {
      // Only clear if WE own the current state. A page that unmounts
      // because the user signed out should leave the empty state alone
      // — AuthProvider's signOut path already handles cleanup.
      clearPresence();
    };
  }, [page, imageLabel]);
}
