// Operations → content moderation panels (Gallery / Reviews / Traced / Library),
// extracted from the AdminDashboard.jsx monolith. Each is self-contained: it
// fetches its own data and has no cross-component dependencies.
import { useState, useEffect } from 'react';
import { listCreations, deleteCreation, setCreationHidden, clearCreationNote, getReviews, getTracedImages } from '../../lib/creations.js';
import { listLibraryImages, addLibraryImage, deleteLibraryImage } from '../../lib/library.js';
import { formatRelative as formatTraceRelative } from '../../lib/traceStats.js';

export function GalleryPanel() {
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState('');

  // Admins see hidden posts too (includeHidden) so they can audit/unhide.
  const load = () => {
    setItems(null);
    listCreations({ limit: 60, includeHidden: true })
      .then(({ items: rows, nextCursor }) => { setItems(rows); setCursor(nextCursor); })
      .catch(() => { setErr('Could not load creations.'); setItems([]); });
  };
  useEffect(() => { load(); }, []);

  const more = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { items: rows, nextCursor } = await listCreations({ limit: 60, offset: cursor, includeHidden: true });
      setItems((c) => [...(c || []), ...rows]);
      setCursor(nextCursor);
    } catch { /* keep what we have */ }
    finally { setLoadingMore(false); }
  };

  const remove = async (it) => {
    if (!window.confirm('Permanently delete this creation?')) return;
    try { await deleteCreation(it); setItems((c) => c?.filter((x) => x.id !== it.id)); }
    catch (e) { setErr(e?.message || 'Delete failed.'); }
  };

  const toggleHidden = async (it) => {
    try {
      await setCreationHidden(it.id, !it.hidden);
      setItems((c) => c?.map((x) => x.id === it.id ? { ...x, hidden: !x.hidden } : x));
    } catch (e) { setErr(e?.message || 'Update failed.'); }
  };

  const clearNote = async (it) => {
    if (!window.confirm('Clear this caption? The artwork stays.')) return;
    try {
      await clearCreationNote(it.id);
      setItems((c) => c?.map((x) => x.id === it.id ? { ...x, note: null } : x));
    } catch (e) { setErr(e?.message || 'Update failed.'); }
  };

  const btn = (color) => ({ marginTop: 4, fontSize: 11, color, background: 'transparent', border: `1px solid ${color}55`, borderRadius: 6, padding: '3px 8px', cursor: 'pointer' });

  return (
    <section className="admin-stats">
      <header className="admin-stats-head">
        <h2>Community gallery</h2>
        <span className="admin-stats-when">{items ? `${items.length}${cursor ? '+' : ''} published` : 'Loading…'}</span>
      </header>
      {err && <p className="admin-error" style={{ margin: 12 }}>{err}</p>}
      {items && items.length === 0 && <p className="admin-ref-muted" style={{ padding: 12 }}>No creations published yet.</p>}
      {items && items.length > 0 && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, padding: 12 }}>
          {items.map((it) => (
            <div key={it.id} style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden', background: '#fff', opacity: it.hidden ? 0.55 : 1 }}>
              <img src={it.thumbUrl || it.url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block', background: '#f3efe7' }} />
              <div style={{ padding: '8px 10px', display: 'grid', gap: 3 }}>
                <strong style={{ fontSize: 13 }}>{it.author}{it.hidden ? ' · hidden' : ''}</strong>
                {it.note && <span style={{ fontSize: 12, color: '#6b5d4d' }}>{it.note}</span>}
                <span style={{ fontSize: 11, color: '#8a7d6b' }}>
                  ♥ {it.likeCount} · {formatTraceRelative(it.createdAt)}{it.referenceUrl ? ' · has reference' : ''}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => toggleHidden(it)} style={btn('#8a6d1a')}>
                    {it.hidden ? 'Unhide' : 'Hide'}
                  </button>
                  {it.note && (
                    <button type="button" onClick={() => clearNote(it)} style={btn('#6b5d4d')}>Clear note</button>
                  )}
                  <button type="button" onClick={() => remove(it)} style={btn('#c0392b')}>Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        {cursor && (
          <div style={{ padding: 12 }}>
            <button type="button" className="admin-ref-btn" onClick={more} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        </>
      )}
    </section>
  );
}

/* Reviews panel — honest reviews collected before the 3rd free trace.        */
export function ReviewsPanel() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    getReviews(200).then(setRows).catch(() => { setErr('Could not load reviews.'); setRows([]); });
  }, []);

  const avg = rows && rows.length
    ? (rows.reduce((s, r) => s + (r.rating || 0), 0) / rows.length).toFixed(1)
    : null;

  return (
    <section className="admin-stats">
      <header className="admin-stats-head">
        <h2>Reviews</h2>
        <span className="admin-stats-when">
          {rows ? `${rows.length} review${rows.length === 1 ? '' : 's'}${avg ? ` · avg ${avg}★` : ''}` : 'Loading…'}
        </span>
      </header>
      {err && <p className="admin-error" style={{ margin: 12 }}>{err}</p>}
      {rows && rows.length === 0 && <p className="admin-ref-muted" style={{ padding: 12 }}>No reviews yet.</p>}
      {rows && rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: '10px 12px', background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <strong style={{ fontSize: 13 }}>{r.display_name}</strong>
                <span style={{ fontSize: 11, color: '#8a7d6b' }}>{formatTraceRelative(r.created_at)}</span>
              </div>
              <div style={{ color: '#e8a020', fontSize: 15, letterSpacing: '1px' }}>
                {'★'.repeat(r.rating)}<span style={{ color: '#d8cdbb' }}>{'★'.repeat(5 - r.rating)}</span>
              </div>
              {r.note && <p style={{ margin: '4px 0 0', fontSize: 13, color: '#4a3f33', lineHeight: 1.45 }}>{r.note}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* Traced panel — what kinds of images people trace (super-optimized thumbs).  */
export function TracedPanel() {
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setItems(null);
    getTracedImages(120).then(({ items: rows, nextCursor }) => { setItems(rows); setCursor(nextCursor); })
      .catch(() => { setErr('Could not load traced images.'); setItems([]); });
  };
  useEffect(() => { load(); }, []);

  const loadMore = async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const { items: rows, nextCursor } = await getTracedImages(120, cursor);
      setItems((c) => [...(c || []), ...rows]);
      setCursor(nextCursor);
    } catch { /* keep */ }
    finally { setMore(false); }
  };

  return (
    <section className="admin-stats">
      <header className="admin-stats-head">
        <h2>What people trace</h2>
        <span className="admin-stats-when">{items ? `${items.length}${cursor ? '+' : ''} captured` : 'Loading…'}</span>
      </header>
      {err && <p className="admin-error" style={{ margin: 12 }}>{err}</p>}
      {items && items.length === 0 && <p className="admin-ref-muted" style={{ padding: 12 }}>No traced images captured yet.</p>}
      {items && items.length > 0 && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, padding: 12 }}>
          {items.map((it) => (
            <div key={it.id} style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
              <img src={it.url} alt={it.label || ''} loading="lazy" decoding="async"
                   style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block', background: '#f3efe7' }} />
              <div style={{ padding: '6px 8px', fontSize: 11, color: '#6b5d4d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {it.author}
              </div>
            </div>
          ))}
        </div>
        {cursor && (
          <div style={{ padding: 12 }}>
            <button type="button" className="admin-ref-btn" onClick={loadMore} disabled={more}>
              {more ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
        </>
      )}
    </section>
  );
}

/* Library panel — manage the pre-uploaded tracing image library (A1).        */
export function LibraryPanel() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => listLibraryImages().then(setItems).catch(() => setMsg('Could not load the library.'));
  useEffect(() => { load(); }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setMsg('Pick an image file first.'); return; }
    setBusy(true); setMsg('');
    try {
      await addLibraryImage({ file, title });
      setTitle(''); setFile(null); if (e.target.reset) e.target.reset();
      await load(); setMsg('Added to the library.');
    } catch (err) { setMsg(err?.message || 'Upload failed.'); }
    finally { setBusy(false); }
  };

  const remove = async (row) => {
    if (!window.confirm('Delete this image from the library?')) return;
    try { await deleteLibraryImage(row); await load(); } catch (err) { setMsg(err?.message || 'Delete failed.'); }
  };

  const inp = { padding: 8, borderRadius: 8, border: '1px solid #cbbfa9', fontFamily: 'inherit' };

  return (
    <section className="admin-stats">
      <header className="admin-stats-head">
        <h2>Image library</h2>
        <span className="admin-stats-when">{items.length} image{items.length === 1 ? '' : 's'}</span>
      </header>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10, padding: 12, maxWidth: 420 }}>
        <label style={{ display: 'grid', gap: 4, fontWeight: 700, fontSize: 13 }}>
          Title (optional)
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Naruto bust" style={inp} />
        </label>
        <label style={{ display: 'grid', gap: 4, fontWeight: 700, fontSize: 13 }}>
          Image (clean line-art)
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
        <button type="submit" className="admin-ref-btn" disabled={busy}>{busy ? 'Uploading…' : 'Add to library'}</button>
        {msg && <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>{msg}</p>}
      </form>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: 12 }}>
        {items.map((it) => (
          <div key={it.id} style={{ border: '1px solid rgba(0,0,0,0.12)', borderRadius: 10, padding: 6, background: '#fff' }}>
            <img src={it.thumbUrl || it.url} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: 110, objectFit: 'contain', background: '#faf6ef', borderRadius: 6 }} />
            <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title || '—'}</div>
            <button type="button" onClick={() => remove(it)}
                    style={{ fontSize: 11, marginTop: 4, cursor: 'pointer', border: '1px solid #c0392b', color: '#c0392b', background: 'transparent', borderRadius: 6, padding: '3px 8px' }}>
              Delete
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
