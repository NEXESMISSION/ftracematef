import { useState } from 'react';
import DemoReel from './DemoReel.jsx';

/**
 * F1 — audience-targeted cards. Each audience is one clean card: an icon, a
 * headline and a blurb. If a card has real demo videos (drop a YouTube Short
 * ID into `videos`), a compact lazy reel strip renders inside the card;
 * otherwise the card is complete on its own — no empty "coming soon" slots.
 *
 * Reels only mount their iframe once scrolled into view (see VideoSlot), so
 * adding embeds later never tanks mobile load time.
 */
const SECTIONS = [
  {
    id: 'anime',
    icon: '🎬',
    title: 'Anime & movie fans',
    blurb: 'Trace your favorite characters — a clean, confident outline, instantly.',
    videos: [],
  },
  {
    id: 'aesthetic',
    icon: '🌸',
    title: 'Journals & pretty things',
    blurb: 'Bullet journals, hand-lettering, cute doodles — laid out perfectly every time.',
    videos: [],
  },
  {
    id: 'kids',
    icon: '🧒',
    title: 'Parents & kids',
    blurb: 'Kids trace animals, cartoons and shapes — building confidence with every line.',
    videos: [],
  },
];

function VideoSlot({ videoId }) {
  const [inView, setInView] = useState(false);
  const ref = (node) => {
    if (!node || inView) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(node);
  };
  return inView ? <DemoReel videoId={videoId} /> : <div ref={ref} className="aud-slot-pending" />;
}

export default function AudienceSections() {
  return (
    <section className="aud tm-section-pad" aria-labelledby="aud-title">
      <div className="section-head">
        <p className="kicker hand">made for you</p>
        <h2 id="aud-title">However you create.</h2>
      </div>

      <div className="aud-cards">
        {SECTIONS.map((s) => (
          <article key={s.id} className={`aud-card aud-card--${s.id}`}>
            <span className="aud-card-icon" aria-hidden="true">{s.icon}</span>
            <h3>{s.title}</h3>
            <p>{s.blurb}</p>
            {s.videos.length > 0 && (
              <div className="aud-reels">
                {s.videos.map((v, i) => (
                  <div key={i} className="aud-reel"><VideoSlot videoId={v.videoId} /></div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
