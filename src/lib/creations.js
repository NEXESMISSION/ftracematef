/**
 * C1/C2/C3 — published creations feed + likes.
 *
 * Result images live in the public `creations` Storage bucket under a
 * {uid}/… prefix (RLS lets a user write only their own prefix). The feed is
 * read through the get_creations_feed RPC (security definer — resolves author
 * display names safely without leaking emails, and paginates with a created_at
 * cursor). Likes go through toggle_like. Result images are watermarked (free)
 * + optimized before upload, sharing the A2/D1 helpers, plus a small thumbnail
 * for the grid.
 */
import { supabase } from './supabase.js';
import { optimizeImage, makeThumbnail } from './imageOptimize.js';
import { watermarkImage } from './watermark.js';

const BUCKET = 'creations';

export function creationPublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Upload one image blob/file into the user's prefix and return its storage
// path. The caller passes an already-processed File (watermark/optimize done).
async function uploadBlob(file, userId) {
  let work = file;
  if (typeof work === 'string') {
    const res = await fetch(work);
    work = await res.blob();
  }
  const type = work.type || 'image/webp';
  const ext = (type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${rand}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, work, { contentType: type, upsert: false });
  if (up.error) throw up.error;
  return path;
}

// Watermark (optional) → optimize an image down to a storable File.
async function processImage(input, { watermark = false } = {}) {
  let work = input;
  if (watermark) {
    try { const wm = await watermarkImage(input, { enabled: true }); if (wm?.file) work = wm.file; }
    catch { /* fall back */ }
  }
  try {
    const opt = await optimizeImage(work, { maxDim: 2048, quality: 0.9 });
    if (opt?.file) { if (opt.url) URL.revokeObjectURL(opt.url); work = opt.file; }
  } catch { /* fall back */ }
  return work;
}

/**
 * C2 — publish a result. `file` is the captured photo of the finished drawing
 * (watermarked unless paid). `reference` (File/Blob/URL, optional) is the image
 * they were tracing — stored alongside so viewers see "traced THIS → made
 * THIS". A small thumbnail is generated for the grid. Returns the new row.
 */
export async function publishCreation({ file, reference, title, note, userId, watermark = true }) {
  if (!userId) throw new Error('Not signed in');

  const uploaded = [];
  try {
    const processed = await processImage(file, { watermark });
    const path = await uploadBlob(processed, userId);
    uploaded.push(path);

    // Thumbnail for the feed grid (best-effort).
    let thumbPath = null;
    try {
      const thumb = await makeThumbnail(processed, { maxDim: 512, quality: 0.82 });
      if (thumb?.file) {
        thumbPath = await uploadBlob(thumb.file, userId);
        if (thumb.url) URL.revokeObjectURL(thumb.url);
        uploaded.push(thumbPath);
      }
    } catch { /* thumbnail is optional */ }

    // Reference copy — only when the user explicitly opted to share what they
    // traced (privacy). Watermarked like the result so a shared source image
    // still carries the Trace Mate mark. We also generate a small thumbnail so
    // the before/after compare popup can show the reference instantly instead
    // of waiting on the full-size download. Best-effort; never blocks publish.
    let referencePath = null;
    let referenceThumbPath = null;
    if (reference) {
      try {
        const ref = await processImage(reference, { watermark });
        referencePath = await uploadBlob(ref, userId);
        uploaded.push(referencePath);
        try {
          const refThumb = await makeThumbnail(ref, { maxDim: 512, quality: 0.82 });
          if (refThumb?.file) {
            referenceThumbPath = await uploadBlob(refThumb.file, userId);
            if (refThumb.url) URL.revokeObjectURL(refThumb.url);
            uploaded.push(referenceThumbPath);
          }
        } catch { /* reference thumb is optional */ }
      } catch { /* ignore */ }
    }

    const ins = await supabase
      .from('creations')
      .insert({
        user_id: userId,
        storage_path: path,
        thumb_path: thumbPath,
        reference_path: referencePath,
        reference_thumb_path: referenceThumbPath,
        title: title || null,
        note: (note || '').trim().slice(0, 200) || null,
      })
      .select()
      .single();
    if (ins.error) throw ins.error;
    return { ...ins.data, url: creationPublicUrl(ins.data.storage_path) };
  } catch (err) {
    // Clean up any orphaned objects if the row insert failed.
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => {});
    throw err;
  }
}

/**
 * The feed, offset-paginated with a sort + optional reference-only filter.
 *   sort: 'new' (newest) | 'top' (most liked)
 *   onlyReference: only creations that include a traced reference image
 *   offset: how many rows to skip (page * limit)
 * Returns { items, nextCursor } where nextCursor is the next offset (number)
 * or null when the feed is exhausted.
 */
export async function listCreations({
  limit = 30, offset = 0, sort = 'new', onlyReference = false,
  currentUserId = null, includeHidden = false,
} = {}) {
  const { data, error } = await supabase.rpc('get_creations_feed', {
    p_limit: limit,
    p_offset: offset,
    p_sort: sort,
    p_only_reference: onlyReference,
    p_include_hidden: includeHidden,
  });
  if (error) throw error;
  const rows = data || [];

  // Which of these has the current user already liked? my_liked_creations
  // returns a setof uuid (bare strings).
  let likedSet = new Set();
  if (currentUserId && rows.length) {
    const ids = rows.map((r) => r.id);
    const { data: liked } = await supabase.rpc('my_liked_creations', { p_ids: ids });
    likedSet = new Set(liked || []);
  }

  const items = rows.map((r) => ({
    id: r.id,
    // Server now returns is_mine (a boolean) instead of the raw author UUID,
    // so anonymous visitors can't enumerate user ids from the public feed.
    mine: r.is_mine ?? false,
    title: r.title,
    note: r.note || null,
    likeCount: r.like_count,
    hidden: r.hidden ?? false,
    createdAt: r.created_at,
    url: creationPublicUrl(r.storage_path),
    thumbUrl: r.thumb_path ? creationPublicUrl(r.thumb_path) : creationPublicUrl(r.storage_path),
    referenceUrl: r.reference_path ? creationPublicUrl(r.reference_path) : null,
    referenceThumbUrl: r.reference_thumb_path ? creationPublicUrl(r.reference_thumb_path) : null,
    storage_path: r.storage_path,
    thumb_path: r.thumb_path,
    reference_path: r.reference_path,
    reference_thumb_path: r.reference_thumb_path,
    author: r.author || 'Artist',
    avatarUrl: r.avatar_url || null,
    likedByMe: likedSet.has(r.id),
  }));

  // Full page → there may be more; next cursor is the next offset.
  const nextCursor = rows.length === limit ? offset + limit : null;
  return { items, nextCursor };
}

/** C3 — toggle a like; returns { liked, like_count }. */
export async function toggleLike(creationId) {
  const { data, error } = await supabase.rpc('toggle_like', { p_creation_id: creationId });
  if (error) throw error;
  return data;
}

/** Report a creation (auto-hides after enough reports). */
export async function reportCreation(creationId, reason = null) {
  const { error } = await supabase.rpc('report_creation', {
    p_creation_id: creationId,
    p_reason: reason,
  });
  if (error) throw error;
}

/** Admin: hide / unhide a creation without deleting it. */
export async function setCreationHidden(creationId, hidden) {
  const { error } = await supabase.rpc('set_creation_hidden', {
    p_creation_id: creationId,
    p_hidden: hidden,
  });
  if (error) throw error;
}

/** Admin: clear a creation's note/caption without deleting the artwork. */
export async function clearCreationNote(creationId) {
  const { error } = await supabase.rpc('admin_clear_creation_note', {
    p_creation_id: creationId,
  });
  if (error) throw error;
}

/** B2 — streak leaderboard rows (ranked by current streak). */
export async function getStreakLeaderboard(limit = 20) {
  const { data, error } = await supabase.rpc('get_streak_leaderboard', { p_limit: limit });
  if (error) throw error;
  return data || [];
}

/** The caller's own streak rank — { rank, current_streak, total } | null. */
export async function getMyStreakRank() {
  const { data, error } = await supabase.rpc('my_streak_rank');
  if (error) return null;
  return Array.isArray(data) ? (data[0] || null) : (data || null);
}

const TRACED_BUCKET = 'traced';
export function tracedPublicUrl(path) {
  return supabase.storage.from(TRACED_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Capture a SUPER-optimized thumbnail of the image a user is tracing, so the
 * operator can see what kinds of images get traced. Tiny (≤360px, low quality)
 * — this is telemetry, not a gallery asset — and entirely best-effort: any
 * failure is swallowed so it never affects the tracing session.
 */
export async function captureTracedImage({ source, userId, label }) {
  if (!source || !userId) return;
  try {
    const thumb = await makeThumbnail(source, { maxDim: 360, quality: 0.6 });
    if (!thumb?.file) return;
    const ext = (thumb.file.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
    const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const path = `${userId}/${rand}.${ext}`;
    const up = await supabase.storage.from(TRACED_BUCKET).upload(path, thumb.file, {
      contentType: thumb.file.type, upsert: false,
    });
    if (thumb.url) URL.revokeObjectURL(thumb.url);
    if (up.error) return;
    await supabase.from('traced_images').insert({
      user_id: userId, thumb_path: path, label: (label || '').slice(0, 120) || null,
    });
  } catch { /* telemetry — never throw into the tracing flow */ }
}

/** Admin: list captured traced images (what people trace). Paginated. */
export async function getTracedImages(limit = 120, before = null) {
  const { data, error } = await supabase.rpc('get_traced_images', { p_limit: limit, p_before: before });
  if (error) throw error;
  const rows = data || [];
  const items = rows.map((r) => ({
    id: r.id,
    label: r.label,
    author: r.display_name || 'Artist',
    createdAt: r.created_at,
    url: tracedPublicUrl(r.thumb_path),
  }));
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
  return { items, nextCursor };
}

/** Admin: reviews list. */
export async function getReviews(limit = 100) {
  const { data, error } = await supabase.rpc('get_reviews', { p_limit: limit });
  if (error) throw error;
  return data || [];
}

/** Submit a review (1–5 stars + optional note). One per user (upserts). */
export async function submitReview(rating, note = null) {
  const { error } = await supabase.rpc('submit_review', { p_rating: rating, p_note: note });
  if (error) throw error;
}

/** Owner (or admin): delete a creation (row + all its storage objects). */
export async function deleteCreation(row) {
  const del = await supabase.from('creations').delete().eq('id', row.id);
  if (del.error) throw del.error;
  const fromUrl = (u) => (u ? u.split(`/${BUCKET}/`)[1] : null);
  const paths = [
    row.storage_path || fromUrl(row.url),
    row.thumb_path || fromUrl(row.thumbUrl),
    row.reference_path || fromUrl(row.referenceUrl),
    row.reference_thumb_path || fromUrl(row.referenceThumbUrl),
  ].filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}
