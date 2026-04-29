const ITEMS = [
  'See it · Trace it · Create it',
  'From paper to perfect line',
  'Made for creators',
  'Trace anything onto real paper',
  'For sketchers, journalers & little artists',
];

function MarqueeContent({ ariaHidden = false }) {
  return (
    <div className="marquee-content" {...(ariaHidden ? { 'aria-hidden': 'true' } : {})}>
      {ITEMS.map((text, i) => (
        <span key={`${text}-${i}`} style={{ display: 'contents' }}>
          <span>{text}</span>
          <span className="dotsep">✦</span>
        </span>
      ))}
    </div>
  );
}

export default function Marquee() {
  return (
    <div className="marquee">
      <div className="marquee-track">
        <MarqueeContent />
        <MarqueeContent ariaHidden />
      </div>
    </div>
  );
}
