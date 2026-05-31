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
    const opt = await optimizeImage(work, { maxDim: 1600, quality: 0.85 });
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
      const thumb = await makeThumbnail(processed, { maxDim: 400, quality: 0.72 });
      if (thumb?.file) {
        thumbPath = await uploadBlob(thumb.file, userId);
        if (thumb.url) URL.revokeObjectURL(thumb.url);
        uploaded.push(thumbPath);
      }
    } catch { /* thumbnail is optional */ }

    // Reference copy — only when the user explicitly opted to share what they
    // traced (privacy). Watermarked like the result so a shared source image
    // still carries the Trace Mate mark. Best-effort; never blocks publishing.
    let referencePath = null;
    if (reference) {
      try {
        const ref = await processImage(reference, { watermark });
        referencePath = await uploadBlob(ref, userId);
        uploaded.push(referencePath);
      } catch { /* ignore */ }
    }

    const ins = await supabase
      .from('creations')
      .insert({
        user_id: userId,
        storage_path: path,
        thumb_path: thumbPath,
        reference_path: referencePath,
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
 * The feed, newest-first, paginated. Pass `before` (an ISO timestamp from the
 * last row of the previous page) to load older items. Returns
 * { items, nextCursor } where nextCursor is null when the feed is exhausted.
 */
export async function listCreations({ limit = 30, before = null, currentUserId = null, includeHidden = false } = {}) {
  const { data, error } = await supabase.rpc('get_creations_feed', {
    p_limit: limit,
    p_before: before,
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
    userId: r.user_id,
    title: r.title,
    note: r.note || null,
    likeCount: r.like_count,
    hidden: r.hidden ?? false,
    createdAt: r.created_at,
    url: creationPublicUrl(r.storage_path),
    thumbUrl: r.thumb_path ? creationPublicUrl(r.thumb_path) : creationPublicUrl(r.storage_path),
    referenceUrl: r.reference_path ? creationPublicUrl(r.reference_path) : null,
    storage_path: r.storage_path,
    thumb_path: r.thumb_path,
    reference_path: r.reference_path,
    author: r.author || 'Artist',
    avatarUrl: r.avatar_url || null,
    likedByMe: likedSet.has(r.id),
  }));

  // Full page → there may be more; cursor is the oldest row's timestamp.
  const nextCursor = rows.length === limit ? rows[rows.length - 1].created_at : null;
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

/** Owner (or admin): delete a creation (row + all its storage objects). */
export async function deleteCreation(row) {
  const del = await supabase.from('creations').delete().eq('id', row.id);
  if (del.error) throw del.error;
  const fromUrl = (u) => (u ? u.split(`/${BUCKET}/`)[1] : null);
  const paths = [
    row.storage_path || fromUrl(row.url),
    row.thumb_path || fromUrl(row.thumbUrl),
    row.reference_path || fromUrl(row.referenceUrl),
  ].filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}
