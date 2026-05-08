// Silent, looping, non-interactive YouTube Short embed.
//
// Uses youtube-nocookie.com for privacy (no third-party cookies set on
// page load). The transparent overlay div on top of the iframe absorbs
// every pointer event so visitors can't pause it, click through to
// YouTube, or expand it to fullscreen — the video is a decorative
// motion element, not a playable thing.
//
// loop=1 only loops a single video when paired with playlist=<videoId>;
// that's a YouTube quirk, not a typo. mute=1 + playsinline=1 are both
// required for autoplay to work in mobile Safari and Android Chrome.
const DEFAULT_VIDEO_ID = 'On22FGIuujc';

function buildSrc(videoId) {
  return (
    `https://www.youtube-nocookie.com/embed/${videoId}` +
    `?autoplay=1` +
    `&mute=1` +
    `&loop=1` +
    `&playlist=${videoId}` +
    `&controls=0` +
    `&modestbranding=1` +
    `&rel=0` +
    `&playsinline=1` +
    `&disablekb=1` +
    `&fs=0` +
    `&iv_load_policy=3`
  );
}

// Pure video frame — no section wrapper or heading. Mounted inside the
// HowItWorks "See it in action" subsection, which already provides those.
export default function DemoReel({ videoId = DEFAULT_VIDEO_ID }) {
  return (
    <div className="demo-reel-frame" aria-hidden="true">
      <iframe
        src={buildSrc(videoId)}
        title="Trace Mate demo"
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        tabIndex="-1"
      />
      {/* Click-blocker. Sits on top of the iframe at full size so any
          tap, drag, or click never reaches the YouTube player chrome —
          no pause, no fullscreen, no overlay link. */}
      <div className="demo-reel-shield" />
    </div>
  );
}
