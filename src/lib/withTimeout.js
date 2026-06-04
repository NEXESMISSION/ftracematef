// Race a promise against a timeout so a stalled network call can't leave the
// UI stuck on "Loading…" / "Opening checkout…" forever. Rejects with a clear
// error the caller's friendlyError() can map to human copy.
//
// Used for user-facing edge-function calls (checkout, billing). The auth path
// has its own withTimeout in AuthProvider; this is the shared one for the rest.
export function withTimeout(promise, ms = 15000, label = 'The request') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out. Check your connection and try again.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
