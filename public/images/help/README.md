# Trace help GIFs

Drop explanatory GIFs here. They are loaded by the in-app help / onboarding
overlay (`src/components/TraceHelp.jsx`) from `/images/help/<key>.gif`.

Each slot is optional: if a GIF is missing, the help row gracefully falls back
to its inline icon + text (an `onError` handler hides the broken image), so the
layout never breaks. Add them whenever you have them.

Expected filenames (all served from this folder, public path `/images/help/`):

- gestures.gif   — drag to move / pinch to zoom / twist to rotate
- opacity.gif    — fading the reference up/down
- flicker.gif    — the pulse (flicker) mode
- recenter.gif   — snapping the overlay back to center
- flip.gif       — mirroring horizontally
- warp.gif       — corner-pin perspective warp
- camera.gif     — switching front/back camera
- flash.gif      — torch on/off
- record.gif     — recording the session
- stop.gif       — ending the session

Recommended: short looping clips, roughly square (they are shown in a 60x60
rounded thumbnail, `object-fit: cover`), kept small for fast loading.
