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

/**
 * Subscribe to the caller's own support thread row coming into existence.
 * Used by the user-facing chat bubble: when the operator initiates a chat
 * via adminStartSupportThreadForUser, the user's open page learns about
 * the new thread without a refresh and can immediately subscribe to
 * messages on it.
 *
 * The filter is by user_id rather than relying on RLS alone so we avoid
 * picking up unrelated thread inserts (admins seeing every user's thread
 * appear) on this channel — that's what subscribeToAllSupportMessages is
 * for on the admin side.
 */
export function subscribeToOwnSupportThread(userId, onInsert) {
  const channel = supabase
    .channel(`support-thread:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'support_threads',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        try { onInsert(payload.new); }
        catch (e) { console.error('[chat] subscribeToOwnSupportThread handler threw:', e); }
      },
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); }
    catch (e) { console.warn('[chat] removeChannel failed:', e); }
  };
}

/**
 * SELECT-only version of startSupportThread — returns the existing thread
 * row or null without creating one. The user-facing bubble uses this on
 * mount so a passive page view doesn't spawn an empty thread for every
 * customer who happens to land on /account.
 *
 * Filtering on user_id explicitly (rather than relying on RLS alone) makes
 * the call safe for admin callers too: an admin lands on their own
 * /account page, this returns their thread, not someone else's.
 */
export async function getExistingSupportThread(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('support_threads')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/* ─────────────────────────── Admin-facing helpers ───────────────────────── */

/**
 * Create or return a support thread for the given user. Admin-only at the
 * server level — non-admins calling this get an authorization error rather
 * than a thread for someone else's account. Used by the operator's "Message
 * a user" picker so a chat can be initiated before the user ever opens the
 * widget themselves.
 */
export async function adminStartSupportThreadForUser(userId) {
  const { data, error } = await supabase.rpc('admin_start_support_thread_for_user', {
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}

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
