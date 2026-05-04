import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { friendlyError } from '../lib/errors.js';
import {
  startSupportThread,
  fetchSupportMessages,
  sendSupportMessage,
  markSupportThreadRead,
  subscribeToThreadMessages,
} from '../lib/chat.js';

// Window of artificial latency before an admin message is rendered. Keeps
// the AI illusion intact — instant replies would feel uncanny once the user
// realises a human is on the other end. Randomised within the window so
// successive messages don't arrive on a metronome.
const ADMIN_REVEAL_MIN_MS = 1100;
const ADMIN_REVEAL_MAX_MS = 2000;

function formatClock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function TypingDots() {
  return (
    <div className="chat-typing" aria-label="TRACE AI is typing">
      <span className="chat-typing-dot" />
      <span className="chat-typing-dot" />
      <span className="chat-typing-dot" />
    </div>
  );
}

export default function Chat() {
  const { user } = useAuth();
  const [thread, setThread]     = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [draft, setDraft]       = useState('');
  const [sending, setSending]   = useState(false);
  const [typingCount, setTypingCount] = useState(0);

  // Bottom anchor — scrollIntoView() on it whenever the message list grows.
  const bottomRef = useRef(null);
  // Track timers we own so unmount can clear pending admin-reveals (otherwise
  // a fired timer would call setMessages on an unmounted component).
  const revealTimers = useRef(new Set());
  // Composer textarea, for auto-resize.
  const inputRef = useRef(null);

  /* ─────────────── Boot: load thread + history, subscribe ─────────────── */

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const t = await startSupportThread();
        if (cancelled) return;
        setThread(t);
        const msgs = await fetchSupportMessages(t.id);
        if (cancelled) return;
        // Initial load = no AI illusion delay; we're just hydrating history.
        setMessages(msgs);
        // Best-effort mark-read; non-fatal if it bounces.
        markSupportThreadRead(t.id).catch(() => { /* ignore */ });
      } catch (e) {
        if (!cancelled) {
          setError(friendlyError(e, "We couldn't open the chat. Try again in a moment."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  /* ─────────────── Realtime subscription ─────────────── */

  useEffect(() => {
    if (!thread?.id) return;

    const onIncoming = (msg) => {
      // Dedupe + branch on role in a single updater. Admin messages get
      // queued behind a short artificial delay so the typing indicator has
      // time to feel real; user messages render immediately (and are
      // typically already on screen via the optimistic insert in onSend).
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        if (msg.sender_role === 'admin') {
          const delay =
            ADMIN_REVEAL_MIN_MS +
            Math.random() * (ADMIN_REVEAL_MAX_MS - ADMIN_REVEAL_MIN_MS);
          setTypingCount((n) => n + 1);
          const t = setTimeout(() => {
            setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
            setTypingCount((n) => Math.max(0, n - 1));
            revealTimers.current.delete(t);
            // Mark read once the message is visible. Race-safe: mark_read is
            // idempotent and the server picks the right column by role.
            markSupportThreadRead(thread.id).catch(() => { /* ignore */ });
          }, delay);
          revealTimers.current.add(t);
          return prev;  // not added yet
        }
        return [...prev, msg];
      });
    };

    const unsub = subscribeToThreadMessages(thread.id, onIncoming);
    return () => {
      unsub();
      // Cancel any pending admin reveals so they don't fire after unmount.
      for (const t of revealTimers.current) clearTimeout(t);
      revealTimers.current.clear();
    };
  }, [thread?.id]);

  /* ─────────────── Mark read on focus ─────────────── */

  useEffect(() => {
    if (!thread?.id) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        markSupportThreadRead(thread.id).catch(() => { /* ignore */ });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [thread?.id]);

  /* ─────────────── Auto-scroll on new content ─────────────── */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typingCount]);

  /* ─────────────── Composer ─────────────── */

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => { autoResize(); }, [draft, autoResize]);

  const onSend = useCallback(async () => {
    if (!thread?.id || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const id = await sendSupportMessage(thread.id, body);
      // Optimistically insert with the returned id; realtime will broadcast
      // the same row but the dedupe-by-id branch in onIncoming swallows it.
      setMessages((prev) => {
        if (prev.some((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            thread_id:   thread.id,
            sender_role: 'user',
            body,
            created_at: new Date().toISOString(),
          },
        ];
      });
      setDraft('');
    } catch (e) {
      setError(friendlyError(e, "We couldn't send that. Please try again."));
    } finally {
      setSending(false);
    }
  }, [draft, sending, thread?.id]);

  const onKeyDown = useCallback((e) => {
    // Enter sends, Shift+Enter inserts a newline. Standard chat affordance.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }, [onSend]);

  const isEmpty = useMemo(() => messages.length === 0, [messages.length]);

  /* ─────────────── Render ─────────────── */

  return (
    <div className="chat-shell">
      <header className="chat-bar">
        <div className="chat-bar-id">
          <div className="chat-avatar" aria-hidden="true">✦</div>
          <div className="chat-bar-who">
            <span className="chat-bar-name">
              TRACE AI
              <span className="chat-bar-tag">Help</span>
            </span>
            <span className="chat-bar-status">
              {typingCount > 0 ? 'typing…' : 'Usually replies within an hour'}
            </span>
          </div>
        </div>
        <Link to="/account" className="chat-bar-back">← Back</Link>
      </header>

      <div className="chat-list" role="log" aria-live="polite" aria-relevant="additions">
        <div className="chat-list-inner">
          {loading && (
            <div className="chat-loading">
              <span className="chat-spinner" aria-hidden="true" />
              <span>Opening chat…</span>
            </div>
          )}

          {error && <p className="chat-error" role="alert">{error}</p>}

          {!loading && isEmpty && (
            <div className="chat-empty">
              <strong>Hi! I'm TRACE AI.</strong>
              <br />
              Ask me anything about your account, billing, tracing tips, or anything else —
              I'll do my best to help.
            </div>
          )}

          {messages.map((m) => {
            const fromMe = m.sender_role === 'user';
            return (
              <div
                key={m.id}
                className={`chat-msg ${fromMe ? 'chat-msg-from-me' : 'chat-msg-from-ai'}`}
              >
                <div className="chat-bubble">{m.body}</div>
                <span className="chat-meta">{formatClock(m.created_at)}</span>
              </div>
            );
          })}

          {typingCount > 0 && <TypingDots />}

          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </div>

      <form
        className="chat-composer"
        onSubmit={(e) => { e.preventDefault(); onSend(); }}
      >
        <div className="chat-composer-inner">
          <textarea
            ref={inputRef}
            className="chat-input"
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={loading || !thread?.id}
            maxLength={4000}
            aria-label="Message TRACE AI"
          />
          <button
            type="submit"
            className="chat-send"
            disabled={sending || loading || !draft.trim() || !thread?.id}
          >
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
