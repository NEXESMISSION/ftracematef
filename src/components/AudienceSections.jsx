import { useState } from 'react';
import DemoReel from './DemoReel.jsx';

/**
 * F1 — three audience-targeted proof rows, compact. Each row is one headline +
 * a tight strip of small video slots. Drop a YouTube Short ID into a slot's
 * `videoId` and it renders a lazy, silent reel; empty slots are slim "soon"
 * placeholders so the layout is complete without eating the screen.
 *
 * Reels only mount their iframe once scrolled into view (see VideoSlot), so
 * the nine embeds never tank mobile load time.
 */
const SECTIONS = [
  {
    id: 'anime',
    title: 'Anime & movie fans',
    blurb: 'Trace your favorite characters — clean outline, instantly.',
    videos: [{ videoId: '' }, { videoId: '' }, { videoId: '' }],
  },
  {
    id: 'aesthetic',
    title: 'Journals & pretty things',
    blurb: 'Bullet journals, lettering, cute doodles — perfect every time.',
    videos: [{ videoId: '' }, { videoId: '' }, { videoId: '' }],
  },
  {
    id: 'kids',
    title: 'Parents & kids',
    blurb: 'Kids trace animals, cartoons & shapes — confidence with every line.',
    videos: [{ videoId: '' }, { videoId: '' }, { videoId: '' }],
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

  if (videoId) {
    return inView ? <DemoReel videoId={videoId} /> : <div ref={ref} className="aud-slot-pending" />;
  }
  return <div className="aud-slot-empty"><span>Soon</span></div>;
}

export default function AudienceSections() {
  return (
    <section className="aud tm-section-pad" aria-labelledby="aud-title">
      <div className="section-head">
        <p className="kicker hand">made for you</p>
        <h2 id="aud-title">However you create.</h2>
      </div>

      <div className="aud-rows">
        {SECTIONS.map((s) => (
          <div key={s.id} className="aud-row">
            <div className="aud-row-head">
              <h3>{s.title}</h3>
              <p>{s.blurb}</p>
            </div>
            <div className="aud-reels">
              {s.videos.map((v, i) => (
                <div key={i} className="aud-reel"><VideoSlot videoId={v.videoId} /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
