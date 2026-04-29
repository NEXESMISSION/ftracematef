// Reusable SVG defs for the watercolor wash + hand-drawn wobble.
// Mounted once at the top of each page so any <svg> on the page can reference url(#wcWash) etc.
export default function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="wcRough" x="-10%" y="-20%" width="120%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.022 0.05" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" />
        </filter>
        <filter id="wcGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.35  0 0 0 0 0.1  0 0 0 0.18 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <radialGradient id="wcWash" cx="40%" cy="35%" r="80%">
          <stop offset="0%" stopColor="#ffe69b" />
          <stop offset="55%" stopColor="#ffd66b" />
          <stop offset="90%" stopColor="#f5be3e" />
          <stop offset="100%" stopColor="#e9a92a" />
        </radialGradient>
        <radialGradient id="wcHi" cx="30%" cy="25%" r="40%">
          <stop offset="0%" stopColor="#fff7d4" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#fff7d4" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}
