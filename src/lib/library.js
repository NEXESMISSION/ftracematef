/**
 * A1 — Pre-uploaded image library.
 *
 * Catalog of admin-curated line-art (table `library_images`) stored in the
 * public `library` Storage bucket. Public read; admin-only writes (enforced by
 * RLS). The user picker calls listLibraryImages(); the admin page uses
 * addLibraryImage()/deleteLibraryImage().
 */
import { supabase } from './supabase.js';
import { optimizeImage } from './imageOptimize.js';

const BUCKET = 'library';

export const LIBRARY_CATEGORIES = [
  { id: 'anime',  label: 'Anime' },
  { id: 'movies', label: 'Movie Characters' },
  { id: 'music',  label: 'Hip-Hop & K-Pop' },
];

export function libraryCategoryLabel(id) {
  return LIBRARY_CATEGORIES.find((c) => c.id === id)?.label || id;
}

export function libraryPublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** List the whole library (public). Each row gets a resolved `url`. */
export async function listLibraryImages() {
  const { data, error } = await supabase
    .from('library_images')
    .select('id, category, title, storage_path, sort_order, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => ({ ...r, url: libraryPublicUrl(r.storage_path) }));
}

/** Admin: optimize → upload to the bucket → insert the catalog row. */
export async function addLibraryImage({ file, category, title }) {
  let toUpload = file;
  try {
    const opt = await optimizeImage(file, { maxDim: 1600, quality: 0.85 });
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

  const ins = await supabase
    .from('library_images')
    .insert({ category, title: title || null, storage_path: path })
    .select()
    .single();
  if (ins.error) {
    // Don't leave an orphaned object if the row insert failed.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw ins.error;
  }
  return { ...ins.data, url: libraryPublicUrl(ins.data.storage_path) };
}

/** Admin: delete the catalog row + its storage object. */
export async function deleteLibraryImage(row) {
  const del = await supabase.from('library_images').delete().eq('id', row.id);
  if (del.error) throw del.error;
  await supabase.storage.from(BUCKET).remove([row.storage_path]).catch(() => {});
}
