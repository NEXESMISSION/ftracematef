import { useEffect, useRef, useState } from 'react';

/**
 * F1 — "Made for you" showcase. Three muted, looping demo reels (no text cards)
 * that show the product in action across audiences.
 *
 * Fastest-load contract: each <video> ships only a lightweight WebP poster up
 * front (preload="none", no src), so the section costs ~25 KB until it scrolls
 * near the viewport. An IntersectionObserver then attaches the MP4 source and
 * starts playback, and pauses it again when the card scrolls away so we never
 * decode three videos off-screen. Sources are optimized H.264 540×960 reels
 * (~0.6–1 MB each) sitting in /public/videos.
 */
const REELS = [
  { id: 'reel1', src: '/videos/reel1.mp4', poster: '/videos/reel1.webp' },
  { id: 'reel2', src: '/videos/reel2.mp4', poster: '/videos/reel2.webp' },
  { id: 'reel3', src: '/videos/reel3.mp4', poster: '/videos/reel3.webp' },
];

function ReelCard({ reel }) {
  const videoRef = useRef(null);
  const [load, setLoad] = useState(false);

  // Attach + play only while near/in view; pause when it leaves.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoad(true);
          el.play?.().catch(() => {});
        } else {
          el.pause?.();
        }
      },
      { rootMargin: '200px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Once the source is attached (load flips true), kick off playback.
  useEffect(() => {
    if (load) videoRef.current?.play?.().catch(() => {});
  }, [load]);

  return (
    <div className="aud-reel-card">
      <video
        ref={videoRef}
        className="aud-reel-video"
        poster={reel.poster}
        src={load ? reel.src : undefined}
        muted
        loop
        autoPlay
        playsInline
        preload="none"
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}

export default function AudienceSections() {
  return (
    <section className="aud tm-section-pad" aria-labelledby="aud-title">
      <div className="section-head">
        <p className="kicker hand">made for you</p>
        <h2 id="aud-title">However you create.</h2>
      </div>

      <div className="aud-reels-grid">
        {REELS.map((r) => (
          <ReelCard key={r.id} reel={r} />
        ))}
      </div>
    </section>
  );
}
