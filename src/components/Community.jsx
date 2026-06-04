import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { listCreations, toggleLike, deleteCreation, reportCreation, getStreakLeaderboard, getMyStreakRank } from '../lib/creations.js';
import CompareLightbox from './CompareLightbox.jsx';

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
export default function Community({ mode, tab: tabProp, onTabChange }) {
  const { user } = useAuth();
  const [items, setItems] = useState(null);    // null = loading first page
  const [cursor, setCursor] = useState(null);  // ISO ts of last row, or null = no more
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lightbox, setLightbox] = useState(null); // creation shown in compare popup
  // `mode` ('gallery' | 'streaks') pins this to one section with no internal tab
  // switcher — used by the dedicated /gallery and /streaks pages. Without it the
  // legacy combined card behaviour applies (tabProp/local state + the switcher).
  const [tabLocal, setTabLocal] = useState('gallery'); // 'gallery' | 'streaks'
  const tab = mode ?? tabProp ?? tabLocal;
  const setTab = (t) => { if (onTabChange) onTabChange(t); else setTabLocal(t); };
  const [board, setBoard] = useState(null);    // streak leaderboard rows
  const [myRank, setMyRank] = useState(null);  // caller's own rank (when outside top 20)
  // Gallery filter: 'new' | 'top' | 'reference'.
  const [filter, setFilter] = useState('new');

  // First page — reloads on user change OR filter change.
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setCursor(null);
    listCreations({
      limit: PAGE,
      offset: 0,
      sort: filter === 'top' ? 'top' : 'new',
      onlyReference: filter === 'reference',
      currentUserId: user?.id || null,
    })
      .then(({ items: rows, nextCursor }) => {
        if (cancelled) return;
        setItems(rows);
        setCursor(nextCursor);
      })
      .catch(() => { if (!cancelled) { setItems([]); setCursor(null); } });
    return () => { cancelled = true; };
  }, [user?.id, filter]);

  const loadMore = useCallback(async () => {
    if (cursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: rows, nextCursor } = await listCreations({
        limit: PAGE, offset: cursor,
        sort: filter === 'top' ? 'top' : 'new',
        onlyReference: filter === 'reference',
        currentUserId: user?.id || null,
      });
      setItems((cur) => [...(cur || []), ...rows]);
      setCursor(nextCursor);
    } catch { /* keep what we have */ }
    finally { setLoadingMore(false); }
  }, [cursor, loadingMore, user?.id, filter]);

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

  // Lazy-load the streak leaderboard (+ the caller's own rank) when opened.
  useEffect(() => {
    if (tab === 'streaks' && board === null) {
      getStreakLeaderboard(20).then(setBoard).catch(() => setBoard([]));
      if (user) getMyStreakRank().then(setMyRank).catch(() => setMyRank(null));
    }
  }, [tab, board, user]);

  // Show the "your rank" row only when the user has a streak AND isn't already
  // visible in the top-20 board above.
  const showMyRank = myRank && myRank.current_streak > 0
    && board && !board.some((r) => r.rank === myRank.rank);

  return (
    <section className="community-card">
      {/* Internal tab switcher only in the legacy combined mode. The dedicated
          pages pass `mode` and provide their own page heading + the tab bar. */}
      {!mode && (
        <div className="community-head">
          <h2 id="community-title">Community</h2>
          <div className="community-tabs" role="tablist">
            <button
              type="button" role="tab" aria-selected={tab === 'gallery'}
              className={`community-tab ${tab === 'gallery' ? 'is-active' : ''}`}
              onClick={() => setTab('gallery')}
            >Gallery</button>
            <button
              type="button" role="tab" aria-selected={tab === 'streaks'}
              className={`community-tab ${tab === 'streaks' ? 'is-active' : ''}`}
              onClick={() => setTab('streaks')}
            >🔥 Streaks</button>
          </div>
        </div>
      )}

      {/* ── Streak leaderboard ── */}
      {tab === 'streaks' && (
        <>
          {board === null && <p className="community-muted">Loading…</p>}
          {board && board.length === 0 && (
            <p className="community-muted">No streaks yet — trace today to start one!</p>
          )}
          {board && board.length > 0 && (
            <div className="community-board">
              {board.map((r) => (
                <div key={r.rank} className="board-row">
                  <span className={`board-rank ${r.rank <= 3 ? 'is-top' : ''}`}>
                    {r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                  </span>
                  {r.avatar_url
                    ? <img className="board-avatar" src={r.avatar_url} alt="" />
                    : <span className="board-avatar board-avatar-fallback">{(r.display_name || '?')[0].toUpperCase()}</span>}
                  <span className="board-name">{r.display_name}</span>
                  <span className="board-metric-val">
                    <strong>🔥 {r.current_streak}</strong>
                    <small>{r.current_streak === 1 ? 'day' : 'days'}</small>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* The caller's own rank, pinned below when they're outside the top 20. */}
          {showMyRank && (
            <div className="community-board community-myrank">
              <div className="board-row is-me">
                <span className="board-rank">{myRank.rank}</span>
                <span className="board-avatar board-avatar-fallback">You</span>
                <span className="board-name">Your rank</span>
                <span className="board-metric-val">
                  <strong>🔥 {myRank.current_streak}</strong>
                  <small>of {myRank.total}</small>
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Gallery filters. */}
      {tab === 'gallery' && (
        <div className="community-filters" role="tablist" aria-label="Filter creations">
          {[
            { id: 'new', label: 'Newest' },
            { id: 'top', label: 'Most liked' },
            { id: 'reference', label: 'With reference' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`community-filter ${filter === f.id ? 'is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >{f.label}</button>
          ))}
        </div>
      )}

      {tab === 'gallery' && items === null && <p className="community-muted">Loading…</p>}
      {tab === 'gallery' && items && items.length === 0 && (
        <p className="community-muted">
          {filter === 'reference'
            ? 'No creations with a reference yet.'
            : 'No creations yet. Finish a trace and tap “Show off your work” to be the first!'}
        </p>
      )}

      {tab === 'gallery' && items && items.length > 0 && (
        <>
          <div className="community-grid">
            {items.map((it) => {
              return (
                <figure key={it.id} className="creation">
                  {/* Tap the image → open the before/after compare popup. */}
                  <button
                    type="button"
                    className="creation-open"
                    onClick={() => setLightbox(it)}
                    aria-label={`Open ${it.author}'s creation`}
                  >
                    <img
                      src={it.thumbUrl}
                      alt={it.title || `Art by ${it.author}`}
                      loading="lazy"
                      decoding="async"
                      // Fade in on load; if already cached (complete at mount), show now.
                      ref={(n) => { if (n?.complete) n.classList.add('is-loaded'); }}
                      onLoad={(e) => e.currentTarget.classList.add('is-loaded')}
                    />
                  </button>

                  {/* Badge: this creation has a reference to compare against. */}
                  {it.referenceUrl && (
                    <span className="creation-ref" aria-hidden="true">⇄</span>
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

      {/* Before/after compare popup — opened by tapping a tile. */}
      <CompareLightbox item={lightbox} onClose={() => setLightbox(null)} />
    </section>
  );
}
