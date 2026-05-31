import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listCreations, toggleLike, deleteCreation, reportCreation } from '../lib/creations.js';

const PAGE = 30;

/**
 * C2 + C3 — community results feed for the account page.
 *
 * Just the creations, newest-first, paginated ("Load more") so it scales as it
 * fills up. Space-efficient: a dense square-tile grid serving small thumbnails,
 * with the note/author/like overlaid on each tile (no caption row), and the
 * traced reference revealed only on tap (a "Reference" peek) instead of a
 * second permanent tile.
 */
export default function Community() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);    // null = loading first page
  const [cursor, setCursor] = useState(null);  // ISO ts of last row, or null = no more
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [flipped, setFlipped] = useState(() => new Set()); // ids showing reference

  // First page (and reload when the signed-in user changes).
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    listCreations({ limit: PAGE, currentUserId: user?.id || null })
      .then(({ items: rows, nextCursor }) => {
        if (cancelled) return;
        setItems(rows);
        setCursor(nextCursor);
      })
      .catch(() => { if (!cancelled) { setItems([]); setCursor(null); } });
    return () => { cancelled = true; };
  }, [user?.id]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: rows, nextCursor } = await listCreations({
        limit: PAGE, before: cursor, currentUserId: user?.id || null,
      });
      setItems((cur) => [...(cur || []), ...rows]);
      setCursor(nextCursor);
    } catch { /* keep what we have */ }
    finally { setLoadingMore(false); }
  }, [cursor, loadingMore, user?.id]);

  const onLike = async (it) => {
    if (!user) return;
    setBusyId(it.id);
    setItems((cur) => cur?.map((c) => c.id === it.id
      ? { ...c, likedByMe: !c.likedByMe, likeCount: c.likeCount + (c.likedByMe ? -1 : 1) }
      : c));
    try {
      const res = await toggleLike(it.id);
      setItems((cur) => cur?.map((c) => c.id === it.id
        ? { ...c, likedByMe: res.liked, likeCount: res.like_count }
        : c));
    } catch {
      setItems((cur) => cur?.map((c) => c.id === it.id
        ? { ...c, likedByMe: it.likedByMe, likeCount: it.likeCount }
        : c));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (it) => {
    if (!window.confirm('Delete this creation?')) return;
    try {
      await deleteCreation(it);
      setItems((cur) => cur?.filter((c) => c.id !== it.id));
    } catch { /* ignore */ }
  };

  const onReport = async (it) => {
    if (!user) return;
    if (!window.confirm('Report this post as inappropriate? It will be reviewed.')) return;
    try {
      await reportCreation(it.id);
      // Drop it from this viewer's feed immediately as feedback.
      setItems((cur) => cur?.filter((c) => c.id !== it.id));
    } catch { /* ignore */ }
  };

  const toggleFlip = (id) => setFlipped((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <section className="community-card" aria-labelledby="community-title">
      <div className="community-head">
        <h2 id="community-title">Community gallery</h2>
        {items && items.length > 0 && (
          <span className="community-count">{items.length}{cursor ? '+' : ''}</span>
        )}
      </div>

      {items === null && <p className="community-muted">Loading…</p>}
      {items && items.length === 0 && (
        <p className="community-muted">
          No creations yet. Finish a trace and tap “Show off your work” to be the first!
        </p>
      )}

      {items && items.length > 0 && (
        <>
          <div className="community-grid">
            {items.map((it) => {
              const showRef = flipped.has(it.id) && it.referenceUrl;
              return (
                <figure key={it.id} className="creation">
                  <img
                    src={showRef ? it.referenceUrl : it.thumbUrl}
                    alt={showRef ? `Reference for ${it.author}'s trace` : (it.title || `Art by ${it.author}`)}
                    loading="lazy"
                  />

                  {/* Peek the traced reference image (top-left), if we have one. */}
                  {it.referenceUrl && (
                    <button
                      type="button"
                      className={`creation-ref ${showRef ? 'is-on' : ''}`}
                      onClick={() => toggleFlip(it.id)}
                      aria-pressed={showRef}
                      title={showRef ? 'Show result' : 'Show what they traced'}
                    >
                      {showRef ? 'Result' : 'Reference'}
                    </button>
                  )}

                  {/* Top-right: owner deletes their own; others can report. */}
                  {user?.id === it.userId ? (
                    <button type="button" className="creation-del" onClick={() => onDelete(it)} aria-label="Delete">
                      ×
                    </button>
                  ) : user ? (
                    <button type="button" className="creation-report" onClick={() => onReport(it)} aria-label="Report" title="Report">
                      ⚑
                    </button>
                  ) : null}

                  {/* Note + author + like, overlaid on a gradient so each tile
                      stays one compact square. */}
                  <figcaption className="creation-bar">
                    {it.note && (
                      <span className="creation-note" title={it.note}>{it.note}</span>
                    )}
                    <span className="creation-byline">
                      <span className="creation-author">{it.author}</span>
                      {user ? (
                        <button
                          type="button"
                          className={`like-btn ${it.likedByMe ? 'is-liked' : ''}`}
                          onClick={() => onLike(it)}
                          disabled={busyId === it.id}
                          aria-pressed={it.likedByMe}
                          aria-label={it.likedByMe ? 'Unlike' : 'Like'}
                        >
                          <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"
                               fill={it.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
                            <path d="M10 17 C10 17 2.5 12.5 2.5 7.5 a3.6 3.6 0 0 1 7 -1.2 a3.6 3.6 0 0 1 7 1.2 C16.5 12.5 10 17 10 17 Z" />
                          </svg>
                          {it.likeCount}
                        </button>
                      ) : (
                        // Signed-out viewers see the count and a hint to sign in.
                        <Link to="/login" className="like-btn" title="Sign in to like">
                          <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true"
                               fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M10 17 C10 17 2.5 12.5 2.5 7.5 a3.6 3.6 0 0 1 7 -1.2 a3.6 3.6 0 0 1 7 1.2 C16.5 12.5 10 17 10 17 Z" />
                          </svg>
                          {it.likeCount}
                        </Link>
                      )}
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>

          {cursor && (
            <button type="button" className="community-more" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </>
      )}
    </section>
  );
}
