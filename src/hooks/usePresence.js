import { useEffect } from 'react';
import { setPresence, clearPresence } from '../lib/presence.js';
import { supabase } from '../lib/supabase.js';

/**
 * Declare which page (and optionally which image) the user is on so the
 * AuthProvider heartbeat can include it in its presence pings.
 *
 * Usage:
 *   usePresence('upload');
 *   usePresence('trace', imageName);
 *
 * Also logs the page in the durable page_visits table so the admin can
 * see a user's navigation history in the activity drill-down. The RPC
 * dedupes same-page-within-30s server-side so React StrictMode double-
 * mounts and rapid back/forward don't flood the log.
 *
 * Cleanup clears the live presence registry so a stale label doesn't
 * leak across routes. The next page that mounts immediately overwrites
 * it; the gap between unmount and next mount is sub-millisecond so the
 * AuthProvider heartbeat never sees the cleared state in practice.
 */
export function usePresence(page, imageLabel = null) {
  useEffect(() => {
    setPresence(page ?? null, imageLabel ?? null);
    if (page) {
      // Fire-and-forget. The RPC is auth-gated server-side; an unsigned
      // call no-ops. Failures are silent — the live `current_page`
      // mirror on profiles is still accurate even if this row never
      // lands.
      // PostgrestBuilder is PromiseLike — .catch() throws. Use the
      // two-arg form of .then() to swallow rejections silently.
      supabase
        .rpc('record_page_visit', { p_page: page, p_image_label: imageLabel ?? null })
        .then(() => {}, () => {});
    }
    return () => {
      // Only clear if WE own the current state. A page that unmounts
      // because the user signed out should leave the empty state alone
      // — AuthProvider's signOut path already handles cleanup.
      clearPresence();
    };
  }, [page, imageLabel]);
}
