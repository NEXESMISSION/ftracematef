// Client helpers for the in-app announcement / broadcast popup.
// ─────────────────────────────────────────────────────────────────────────────
// Both calls go through security-definer RPCs that key off auth.uid(), so they
// only do anything for a signed-in user. Everything here is best-effort: a
// failure (offline, RLS, etc.) must never break app render, so we swallow
// errors and just return null / do nothing — same posture as presence pings.

import { supabase } from './supabase.js';

// Returns the single announcement to show this user right now, or null.
// Shape: { id, title, body, cta_label, cta_url }.
export async function getActiveAnnouncement() {
  try {
    const { data, error } = await supabase.rpc('get_active_announcement');
    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}

// Record a lifecycle event for an announcement. kind ∈ 'seen'|'tapped'|'dismissed'.
export async function recordAnnouncementEvent(id, kind) {
  if (!id || !kind) return;
  try {
    await supabase.rpc('record_announcement_event', { p_id: id, p_kind: kind });
  } catch {
    /* best-effort */
  }
}
