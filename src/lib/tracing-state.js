// Module-level flag flipped on/off by the trace session lifecycle in
// Trace.jsx. Read by the auto-update poller so a new deploy never reloads
// a tab while the user is mid-session — the reload waits until they
// finish (or leave the studio) and then fires on the next tick.

let active = false;

export function setTracing(v) {
  active = !!v;
}

export function isTracing() {
  return active;
}
