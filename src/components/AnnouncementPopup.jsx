// Global in-app announcement popup.
// ─────────────────────────────────────────────────────────────────────────────
// Mounted once for the whole app. On mount (and whenever the signed-in user
// changes) it asks the server for the single announcement to show this user. If
// there is one, it renders a centered, dismissible modal and reports the
// lifecycle (seen / tapped / dismissed). Renders null until it has something,
// so it never blocks or delays app render.
//
// Signed-in users only — segment targeting needs a profile, so the RPC returns
// null for anonymous visitors and we simply show nothing.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.jsx';
import { getActiveAnnouncement, recordAnnouncementEvent } from '../lib/announcements.js';
import './AnnouncementPopup.css';

export default function AnnouncementPopup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ann, setAnn] = useState(null);

  // Fetch once per signed-in user. Anonymous → nothing.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setAnn(null);
      return undefined;
    }
    (async () => {
      const a = await getActiveAnnouncement();
      if (cancelled) return;
      if (a && a.id) {
        setAnn(a);
        // Record 'seen' the moment it's shown.
        recordAnnouncementEvent(a.id, 'seen');
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const dismiss = useCallback(() => {
    setAnn((cur) => {
      if (cur) recordAnnouncementEvent(cur.id, 'dismissed');
      return null;
    });
  }, []);

  // Esc to close.
  useEffect(() => {
    if (!ann) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ann, dismiss]);

  if (!ann) return null;

  const onCta = () => {
    recordAnnouncementEvent(ann.id, 'tapped');
    const url = ann.cta_url;
    setAnn(null);
    if (!url) return;
    if (url.startsWith('/')) {
      navigate(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      className="ann-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={ann.title || 'Announcement'}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}
    >
      <div className="ann-modal">
        <button className="ann-close" type="button" aria-label="Close" onClick={dismiss}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {ann.title ? <h2 className="ann-title">{ann.title}</h2> : null}
        <p className="ann-body">{ann.body}</p>

        <div className="ann-actions">
          {ann.cta_label && ann.cta_url ? (
            <button className="ann-btn ann-btn-primary" type="button" onClick={onCta}>
              {ann.cta_label}
            </button>
          ) : null}
          <button className="ann-btn ann-btn-ghost" type="button" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
