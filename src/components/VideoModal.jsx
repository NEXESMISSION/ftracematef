import { useEffect } from 'react';

export default function VideoModal({ open, videoId, onClose }) {
  // Esc to close + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const isReal = videoId && videoId !== 'YOUR_VIDEO_ID';
  const src = open && isReal
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`
    : '';

  return (
    <div
      className={`video-modal${open ? ' is-open' : ''}`}
      role="dialog"
      aria-label="See Trace Mate in action"
      aria-hidden={!open}
    >
      <div className="video-modal-backdrop" onClick={onClose}></div>
      <div className="video-modal-inner">
        <button type="button" className="video-modal-close" aria-label="Close video" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round">
            <path d="M6 6 L18 18 M18 6 L6 18" />
          </svg>
        </button>
        <div className="video-modal-frame">
          <iframe
            src={src}
            title="See Trace Mate in action"
            frameBorder="0"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
