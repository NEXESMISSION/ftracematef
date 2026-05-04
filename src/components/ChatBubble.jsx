import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { friendlyError } from '../lib/errors.js';
import {
  startSupportThread,
  getExistingSupportThread,
  fetchSupportMessages,
  sendSupportMessage,
  markSupportThreadRead,
  subscribeToThreadMessages,
  subscribeToOwnSupportThread,
} from '../lib/chat.js';

// Window of artificial latency before an admin message renders WHILE the
// panel is open — keeps the AI illusion intact without making the user
// wait when the bubble is closed (they're not watching anyway).
const ADMIN_REVEAL_MIN_MS = 1100;
const ADMIN_REVEAL_MAX_MS = 2000;

// How long the popup teaser hangs around after a new message arrives. Long
// enough to read, short enough to feel passive.
const TEASER_LIFETIME_MS = 6000;

function formatClock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function TypingDots() {
  return (
    <div className="cb-typing" aria-label="TRACE AI is typing">
      <span className="cb-typing-dot" />
      <span className="cb-typing-dot" />
      <span className="cb-typing-dot" />
    </div>
  );
}

/**
 * Floating "TRACE AI" chat widget. Mounted on /account for non-admin users.
 * Behaviour:
 *   - Default: a quiet circle in the bottom-right corner.
 *   - On a new admin message (when closed): a small teaser pops out for a
 *     few seconds, an unread badge sticks until the user opens the panel.
 *   - Open: a clean message panel anchored above the circle.
 *
 * Thread creation is lazy: a passive Account.jsx visit never spawns a
 * thread row. The thread is created on the user's first send, OR appears
 * via realtime when the operator initiates one from the admin dashboard.
 */
export default function ChatBubble() {
  const { user } = useAuth();
  const [thread, setThread]       = useState(null);
  const [messages, setMessages]   = useState([]);
  const [open, setOpen]           = useState(false);
  const [draft, setDraft]         = useState('');
  const [sending, setSending]     = useState(false);
  const [error, setError]         = useState(null);
  const [typingCount, setTypingCount] = useState(0);
  const [teaser, setTeaser]       = useState(null);  // { id, body }
  // Tracks which messages the user has actually seen (panel-open + visible).
  // Stamped client-side; the server's last_user_read_at is the source of
  // truth for the unread badge calculation.
  const [readAt, setReadAt]       = useState(null);

  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  // Live ref to `open` so realtime handlers always see the current state
  // without needing to re-subscribe on every toggle.
  const openRef      = useRef(false);
  useEffect(() => { openRef.current = open; }, [open]);
  // Reveal timers (artificial AI delay) — cleared on unmount.
  const revealTimers = useRef(new Set());
  // Teaser auto-dismiss timer.
  const teaserTimer  = useRef(null);

  /* ────────── Boot: look for an existing thread, subscribe ────────── */

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        const t = await getExistingSupportThread(user.id);
        if (cancelled) return;
        if (t) {
          setThread(t);
          setReadAt(t.last_user_read_at);
          const msgs = await fetchSupportMessages(t.id);
          if (cancelled) return;
          setMessages(msgs);
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[ChatBubble] could not load thread:', e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  /* ────────── Realtime: pick up admin-initiated thread creation ────────── */

  useEffect(() => {
    if (!user?.id) return;
    if (thread?.id) return;  // already have one — no need to listen for inserts
    const unsub = subscribeToOwnSupportThread(user.id, async (newThread) => {
      setThread(newThread);
      setReadAt(newThread.last_user_read_at);
      try {
        const msgs = await fetchSupportMessages(newThread.id);
        setMessages(msgs);
      } catch (e) {
        console.warn('[ChatBubble] fetch after thread-insert failed:', e);
      }
    });
    return unsub;
  }, [user?.id, thread?.id]);

  /* ────────── Realtime: incoming messages on our thread ────────── */

  useEffect(() => {
    if (!thread?.id) return;

    const showTeaser = (msg) => {
      if (teaserTimer.current) clearTimeout(teaserTimer.current);
      setTeaser({ id: msg.id, body: msg.body });
      teaserTimer.current = setTimeout(() => {
        setTeaser((cur) => (cur?.id === msg.id ? null : cur));
        teaserTimer.current = null;
      }, TEASER_LIFETIME_MS);
    };

    const onIncoming = (msg) => {
      // Drop our own optimistic insert echoes — same id already in state.
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;

        if (msg.sender_role === 'admin') {
          // When the panel is OPEN, route through the typing-dots delay so
          // it feels like an AI thinking. When CLOSED, drop it in directly
          // — no one's watching, and the unread badge is what matters.
          if (openRef.current) {
            const delay =
              ADMIN_REVEAL_MIN_MS +
              Math.random() * (ADMIN_REVEAL_MAX_MS - ADMIN_REVEAL_MIN_MS);
            setTypingCount((n) => n + 1);
            const t = setTimeout(() => {
              setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
              setTypingCount((n) => Math.max(0, n - 1));
              revealTimers.current.delete(t);
              if (openRef.current) {
                markSupportThreadRead(thread.id).catch(() => {});
              }
            }, delay);
            revealTimers.current.add(t);
            return prev;
          }
          showTeaser(msg);
          return [...prev, msg];
        }

        // Echo of our own user message via realtime — append if missing
        // (won't happen often thanks to optimistic insert, but it's a
        // useful safety net for messages sent from another tab).
        return [...prev, msg];
      });
    };

    const unsub = subscribeToThreadMessages(thread.id, onIncoming);
    return () => {
      unsub();
      for (const t of revealTimers.current) clearTimeout(t);
      revealTimers.current.clear();
    };
  }, [thread?.id]);

  /* ────────── Cleanup teaser timer on unmount ────────── */

  useEffect(() => () => {
    if (teaserTimer.current) clearTimeout(teaserTimer.current);
  }, []);

  /* ────────── Auto-scroll on new content (panel-open only) ────────── */

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [open, messages.length, typingCount]);

  /* ────────── Auto-resize composer ────────── */

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);
  useEffect(() => { if (open) autoResize(); }, [draft, open, autoResize]);

  /* ────────── Open / close + mark-read ────────── */

  const onOpen = useCallback(async () => {
    setOpen(true);
    setTeaser(null);
    if (teaserTimer.current) {
      clearTimeout(teaserTimer.current);
      teaserTimer.current = null;
    }
    if (thread?.id) {
      try {
        const stamp = await markSupportThreadRead(thread.id);
        setReadAt(stamp);
      } catch (e) {
        console.warn('[ChatBubble] markRead failed:', e);
      }
    }
    // Focus the input after the open animation has had a beat.
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [thread?.id]);

  const onClose = useCallback(() => {
    setOpen(false);
  }, []);

  /* ────────── Send (creates thread on first message) ────────── */

  const onSend = useCallback(async () => {
    if (sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      // Lazy thread creation — first send is what calls start_support_thread.
      let t = thread;
      if (!t) {
        t = await startSupportThread();
        setThread(t);
        setReadAt(t.last_user_read_at);
      }
      const id = await sendSupportMessage(t.id, body);
      setMessages((prev) => (
        prev.some((m) => m.id === id) ? prev : [
          ...prev,
          {
            id,
            thread_id:   t.id,
            sender_role: 'user',
            body,
            created_at: new Date().toISOString(),
          },
        ]
      ));
      setDraft('');
    } catch (e) {
      setError(friendlyError(e, "Couldn't send. Try again."));
    } finally {
      setSending(false);
    }
  }, [draft, sending, thread]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  /* ────────── Unread count (admin messages newer than user's read pointer) ─── */

  const unreadCount = useMemo(() => {
    if (open) return 0;  // hide badge while panel is open
    const cutoff = readAt ? new Date(readAt).getTime() : 0;
    let n = 0;
    for (const m of messages) {
      if (m.sender_role === 'admin' && new Date(m.created_at).getTime() > cutoff) n++;
    }
    return n;
  }, [messages, readAt, open]);

  /* ────────── Render ────────── */

  if (!user?.id) return null;

  const hasMessages = messages.length > 0;

  return (
    <div className={`cb-root ${open ? 'is-open' : ''}`}>
      {/* Teaser popup — only when closed and a fresh admin message landed */}
      {!open && teaser && (
        <button
          type="button"
          className="cb-teaser"
          onClick={onOpen}
          aria-label="Open new message"
        >
          <span className="cb-teaser-from">TRACE AI</span>
          <span className="cb-teaser-body">{teaser.body}</span>
        </button>
      )}

      {/* Panel */}
      <div className="cb-panel" role="dialog" aria-label="Chat with TRACE AI" aria-hidden={!open}>
        <header className="cb-panel-head">
          <div className="cb-panel-id">
            <span className="cb-avatar" aria-hidden="true">✦</span>
            <div className="cb-panel-who">
              <span className="cb-panel-name">TRACE AI</span>
              <span className="cb-panel-status">
                {typingCount > 0 ? 'typing…' : 'Usually replies within an hour'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="cb-panel-close"
            onClick={onClose}
            aria-label="Close chat"
          >
            ✕
          </button>
        </header>

        <div className="cb-list" role="log" aria-live="polite" aria-relevant="additions">
          {!hasMessages && (
            <div className="cb-empty">
              <strong>Hi! I'm TRACE AI.</strong>
              <span>Ask me anything — billing, your account, tracing tips. I'll do my best to help.</span>
            </div>
          )}

          {messages.map((m) => {
            const fromMe = m.sender_role === 'user';
            return (
              <div
                key={m.id}
                className={`cb-msg ${fromMe ? 'cb-msg-me' : 'cb-msg-ai'}`}
              >
                <div className="cb-bubble">{m.body}</div>
                <span className="cb-meta">{formatClock(m.created_at)}</span>
              </div>
            );
          })}

          {typingCount > 0 && <TypingDots />}
          <div ref={bottomRef} aria-hidden="true" />
        </div>

        {error && <p className="cb-error" role="alert">{error}</p>}

        <form
          className="cb-composer"
          onSubmit={(e) => { e.preventDefault(); onSend(); }}
        >
          <textarea
            ref={inputRef}
            className="cb-input"
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={4000}
            aria-label="Message TRACE AI"
          />
          <button
            type="submit"
            className="cb-send"
            disabled={sending || !draft.trim()}
            aria-label="Send"
          >
            {sending ? '…' : '➤'}
          </button>
        </form>
      </div>

      {/* Floating button — always rendered; visually hidden when panel is open */}
      <button
        type="button"
        className="cb-fab"
        onClick={open ? onClose : onOpen}
        aria-label={open ? 'Close chat' : 'Open chat with TRACE AI'}
        aria-expanded={open}
      >
        <span className="cb-fab-icon" aria-hidden="true">
          {open ? '✕' : '✦'}
        </span>
        {!open && unreadCount > 0 && (
          <span className="cb-fab-badge" aria-label={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
