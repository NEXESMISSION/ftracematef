/**
 * Stores the user's uploaded image as a base64 data URL in sessionStorage so
 * it survives the OAuth round-trip + checkout redirect chain. After payment,
 * the Trace page reads it back.
 *
 * sessionStorage gives us ~5MB. We bail out cleanly if the image is too big
 * (rare — most phone photos compress under that with JPEG, and our Upload
 * already caps at 25MB raw).
 */

const KEY      = 'tm:pending-image';
const META_KEY = 'tm:pending-image-meta';

const MAX_BYTES = 4_500_000; // ~4.5MB after base64 inflation

/** Convert a File to a base64 data URL. */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Save a File. Returns true on success, false if it was too big to persist. */
export async function savePendingImage(file) {
  if (!file) return false;
  try {
    const dataUrl = await fileToDataUrl(file);
    if (dataUrl.length > MAX_BYTES) {
      // Too big — clear any previous and bail.
      clearPendingImage();
      return false;
    }
    sessionStorage.setItem(KEY, dataUrl);
    sessionStorage.setItem(META_KEY, JSON.stringify({
      name: file.name,
      type: file.type,
      size: file.size,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    clearPendingImage();
    return false;
  }
}

/** Read the saved image. Returns { dataUrl, name } or null. */
export function loadPendingImage() {
  try {
    const dataUrl = sessionStorage.getItem(KEY);
    if (!dataUrl) return null;
    // Defensive: only return values that are clearly image data URLs. If a
    // future XSS or extension wrote something else into our key, refuse to
    // hand it to <img src="…"> downstream.
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      clearPendingImage();
      return null;
    }
    const metaRaw = sessionStorage.getItem(META_KEY);
    const meta    = metaRaw ? JSON.parse(metaRaw) : {};
    return { dataUrl, name: meta.name ?? 'Reference' };
  } catch {
    return null;
  }
}

export function hasPendingImage() {
  try { return !!sessionStorage.getItem(KEY); } catch { return false; }
}

export function clearPendingImage() {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(META_KEY);
  } catch { /* ignore */ }
}
