import { useState } from 'react';
import DemoReel from './DemoReel.jsx';

/**
 * F1 — three audience-targeted proof sections, each showing the product in use
 * for that crowd. Built as a data-driven shell: drop a YouTube Short ID into
 * each slot's `videoId` and it renders a lazy, silent, looping reel (same embed
 * as the hero demo). Slots with no `videoId` show a "coming soon" placeholder
 * so the layout is complete before the clips exist.
 *
 * To fill: replace the empty `videoId: ''` strings below with the Short IDs.
 * Reels only mount their iframe once scrolled into view (see VideoSlot), so
 * nine embeds never tank mobile load time.
 */
const SECTIONS = [
  {
    id: 'anime',
    kicker: 'for anime & movie fans',
    title: 'Trace your favorite characters.',
    blurb: 'Anime, manga, movie posters — get the clean outline and make it yours.',
    videos: [
      { videoId: '', label: 'Anime trace 1' },
      { videoId: '', label: 'Anime trace 2' },
      { videoId: '', label: 'Movie character trace' },
    ],
  },
  {
    id: 'aesthetic',
    kicker: 'for journals & pretty things',
    title: 'Make your pages look professional.',
    blurb: 'Bullet journals, lettering, cute doodles — trace it perfectly every time.',
    videos: [
      { videoId: '', label: 'Journal spread' },
      { videoId: '', label: 'Lettering' },
      { videoId: '', label: 'Cute doodle' },
    ],
  },
  {
    id: 'kids',
    kicker: 'for parents & kids',
    title: 'Hours of screen-free-ish fun.',
    blurb: 'Kids trace animals, cartoons, and shapes — building confidence with every line.',
    videos: [
      { videoId: '', label: 'Kid tracing animals' },
      { videoId: '', label: 'Cartoon trace' },
      { videoId: '', label: 'Shapes & letters' },
    ],
  },
];

function VideoSlot({ videoId, label, poster }) {
  // Only mount the (heavy) YouTube iframe when the slot scrolls into view.
  const [inView, setInView] = useState(false);
  const ref = (node) => {
    if (!node || inView) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(node);
  };

  if (videoId) {
    return inView
      ? <DemoReel videoId={videoId} />
      : <div ref={ref} className="aud-slot-pending" aria-label={label} />;
  }
  // No video yet — placeholder so the grid is complete.
  return (
    <div className="aud-slot-empty" role="img" aria-label={`${label} — coming soon`}>
      {poster
        ? <img src={poster} alt="" loading="lazy" />
        : <span className="aud-slot-empty-text">Coming soon</span>}
    </div>
  );
}

export default function AudienceSections() {
  return (
    <section className="aud tm-section-pad" aria-labelledby="aud-title">
      <div className="section-head">
        <p className="kicker hand">made for you</p>
        <h2 id="aud-title">However you create.</h2>
        <p className="lead">See Trace Mate in action for the way you like to make things.</p>
      </div>

      <div className="aud-sections">
        {SECTIONS.map((s) => (
          <div key={s.id} className="aud-block">
            <div className="aud-block-head">
              <p className="kicker hand">{s.kicker}</p>
              <h3>{s.title}</h3>
              <p className="aud-blurb">{s.blurb}</p>
            </div>
            <div className="aud-reels">
              {s.videos.map((v, i) => (
                <div key={i} className="aud-reel">
                  <VideoSlot videoId={v.videoId} label={v.label} poster={v.poster} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
