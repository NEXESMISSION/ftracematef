// Support chat — thin client over the security-definer RPCs in
// 20260504000000_support_chat.sql. Both the user-facing /chat page and the
// admin dashboard's support inbox call through this module.
//
// All writes go through RPCs (the client cannot insert into support_messages
// or support_threads directly — RLS forbids it). The RPCs enforce the
// real authorization, rate limiting, and sender_role assignment.

import { supabase } from './supabase.js';

/* ─────────────────────────── User-facing helpers ────────────────────────── */

/**
 * Resolve the caller's support thread, creating it if it doesn't exist.
 * Returns the thread row.
 */
export async function startSupportThread() {
  const { data, error } = await supabase.rpc('start_support_thread');
  if (error) throw error;
  return data;
}

/**
 * Fetch the last `limit` messages of a thread, oldest-first (so the caller
 * can render top-down without reversing). Default 200 covers months of
 * casual support chat without paging.
 */
export async function fetchSupportMessages(threadId, { limit = 200 } = {}) {
  const { data, error } = await supabase
    .from('support_messages')
    .select('id, thread_id, sender_role, body, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * Send a message into a thread. Sender role is decided server-side based on
 * the caller's is_admin flag, so this single function is used by both the
 * user page and the admin panel. Returns the inserted message id.
 */
export async function sendSupportMessage(threadId, body) {
  const { data, error } = await supabase.rpc('send_support_message', {
    p_thread_id: threadId,
    p_body:      body,
  });
  if (error) throw error;
  return data;  // uuid of the inserted row
}

/**
 * Mark a thread as read for the caller. Idempotent — safe to call on every
 * focus event without rate-limiting concerns. Server picks the right column
 * (last_admin_read_at vs last_user_read_at) based on the caller's role.
 */
export async function markSupportThreadRead(threadId) {
  const { data, error } = await supabase.rpc('mark_support_thread_read', {
    p_thread_id: threadId,
  });
  if (error) throw error;
  return data;
}

/**
 * Subscribe to new messages in a single thread. Returns an unsubscribe
 * function. RLS filters at the publication layer, so a non-owner / non-admin
 * couldn't subscribe successfully even if they guessed the thread id.
 */
export function subscribeToThreadMessages(threadId, onInsert) {
  const channel = supabase
    .channel(`support-msgs:${threadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `thread_id=eq.${threadId}`,
      },
      (payload) => {
        try { onInsert(payload.new); }
        catch (e) { console.error('[chat] subscribeToThreadMessages handler threw:', e); }
      },
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); }
    catch (e) { console.warn('[chat] removeChannel failed:', e); }
  };
}

/* ─────────────────────────── Admin-facing helpers ───────────────────────── */

/**
 * One-call inbox view for the admin dashboard: every thread joined with the
 * owning user's profile, the last message preview, and an unread flag. The
 * RPC server-side gates on is_admin so non-admins get an empty array.
 */
export async function listSupportThreads() {
  const { data, error } = await supabase.rpc('list_support_threads');
  if (error) throw error;
  return data ?? [];
}

/**
 * Admin-side subscription: any new message in any thread we can see. Used to
 * refresh the inbox sidebar in real time. RLS lets admins see all message
 * rows, so no filter is needed. Non-admins would see nothing anyway.
 */
export function subscribeToAllSupportMessages(onInsert) {
  const channel = supabase
    .channel('support-msgs:admin')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'support_messages' },
      (payload) => {
        try { onInsert(payload.new); }
        catch (e) { console.error('[chat] subscribeToAllSupportMessages handler threw:', e); }
      },
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); }
    catch (e) { console.warn('[chat] removeChannel failed:', e); }
  };
}
