// Module-level "what's the user doing right now" registry.
//
// AuthProvider runs the actual heartbeat (every ~60s while the tab is
// visible) and reads `currentPresence()` to decide what page label and
// image label to attach to each touch_last_seen() RPC call. Pages call
// `setPresence(page, imageLabel)` via the usePresence() hook.
//
// Why a module singleton instead of React context? The heartbeat lives in
// AuthProvider at the top of the tree; the page declarations live deep
// inside <Route> elements. A context value defined in AuthProvider would
// have to be set by descendants (impossible without a shared parent), so
// we'd end up with a separate PresenceProvider just to broker between
// the two. A module variable does the same job with one fewer indirection
// and the heartbeat reads it on each tick anyway — no re-render needed.
//
// The label is plain free text; it's clamped server-side to 64 chars
// (page) and 200 chars (image label).

let _page  = null;       // string | null
let _image = null;       // string | null

// Bumped whenever setPresence runs so the heartbeat can detect a change
// since its last RPC and fire an immediate ping if the page just shifted.
let _version = 0;
const listeners = new Set();

export function setPresence(page, imageLabel = null) {
  const nextPage  = typeof page  === 'string' ? page  : null;
  const nextImage = typeof imageLabel === 'string' ? imageLabel : null;
  if (nextPage === _page && nextImage === _image) return;
  _page  = nextPage;
  _image = nextImage;
  _version++;
  for (const fn of listeners) {
    try { fn(); } catch { /* listener errors must not poison neighbours */ }
  }
}

export function clearPresence() {
  setPresence(null, null);
}

export function currentPresence() {
  return { page: _page, imageLabel: _image, version: _version };
}

// AuthProvider subscribes so it can fire an immediate heartbeat whenever
// the user changes pages, instead of waiting up to 60s for the next tick.
export function onPresenceChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
