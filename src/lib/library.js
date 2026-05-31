/**
 * A1 — Pre-uploaded image library.
 *
 * Catalog of admin-curated line-art (table `library_images`) stored in the
 * public `library` Storage bucket. Public read; admin-only writes (enforced by
 * RLS). The user picker calls listLibraryImages(); the admin page uses
 * addLibraryImage()/deleteLibraryImage().
 *
 * The library is a single flat collection — no categories. New uploads land
 * under a 'general' prefix.
 */
import { supabase } from './supabase.js';
import { optimizeImage, makeThumbnail } from './imageOptimize.js';

const BUCKET = 'library';

export function libraryPublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** List the whole library (public). Each row gets `url` (full) + `thumbUrl`
 *  (small, for grids — falls back to the full image on older rows). */
export async function listLibraryImages() {
  const { data, error } = await supabase
    .from('library_images')
    .select('id, category, title, storage_path, thumb_path, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    url: libraryPublicUrl(r.storage_path),
    thumbUrl: r.thumb_path ? libraryPublicUrl(r.thumb_path) : libraryPublicUrl(r.storage_path),
  }));
}

/** Admin: optimize → upload to the bucket → insert the catalog row. */
export async function addLibraryImage({ file, title }) {
  const category = 'general';
  let toUpload = file;
  try {
    const opt = await optimizeImage(file, { maxDim: 2048, quality: 0.9 });
    if (opt?.file) {
      toUpload = opt.file;
      if (opt.url) URL.revokeObjectURL(opt.url);
    }
  } catch { /* fall back to the raw file */ }

  const ext = (toUpload.type.split('/')[1] || 'webp').replace('jpeg', 'jpg');
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${category}/${rand}.${ext}`;

  const up = await supabase.storage.from(BUCKET).upload(path, toUpload, {
    contentType: toUpload.type,
    upsert: false,
  });
  if (up.error) throw up.error;

  // Small thumbnail for the picker grid (best-effort).
  let thumbPath = null;
  try {
    const thumb = await makeThumbnail(toUpload, { maxDim: 512, quality: 0.82 });
    if (thumb?.file) {
      const text = `${category}/thumb-${rand}.${(thumb.file.type.split('/')[1] || 'webp').replace('jpeg', 'jpg')}`;
      const tup = await supabase.storage.from(BUCKET).upload(text, thumb.file, {
        contentType: thumb.file.type, upsert: false,
      });
      if (!tup.error) thumbPath = text;
      if (thumb.url) URL.revokeObjectURL(thumb.url);
    }
  } catch { /* thumbnail is optional */ }

  const ins = await supabase
    .from('library_images')
    .insert({ category, title: title || null, storage_path: path, thumb_path: thumbPath })
    .select()
    .single();
  if (ins.error) {
    // Don't leave orphaned objects if the row insert failed.
    const orphans = [path]; if (thumbPath) orphans.push(thumbPath);
    await supabase.storage.from(BUCKET).remove(orphans).catch(() => {});
    throw ins.error;
  }
  return {
    ...ins.data,
    url: libraryPublicUrl(ins.data.storage_path),
    thumbUrl: thumbPath ? libraryPublicUrl(thumbPath) : libraryPublicUrl(ins.data.storage_path),
  };
}

/** Admin: delete the catalog row + its storage objects (full + thumb). */
export async function deleteLibraryImage(row) {
  const del = await supabase.from('library_images').delete().eq('id', row.id);
  if (del.error) throw del.error;
  const paths = [row.storage_path].filter(Boolean);
  if (row.thumb_path) paths.push(row.thumb_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => {});
}
