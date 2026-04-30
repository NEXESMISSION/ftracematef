import { useEffect } from 'react';

/**
 * Friendly modal popup for surfacing errors / explanations to the user.
 *
 * Reuses `.profile-modal*` styles so it visually matches the existing
 * change-plan modal. Render conditionally with `open` and pass `onClose`.
 *
 * Variants via `tone`:
 *   - 'error'   (default) — soft red accent, for failed actions
 *   - 'info'              — neutral, for explanations
 */
export default function Alert({
  open,
  onClose,
  title = 'Heads up',
  message,
  tone = 'error',
  primary,    // optional { label, onClick }
  dismissLabel = 'Got it',
}) {
  // Close on Escape — matches user expectations for modals.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const accent = tone === 'error' ? '#b03a3a' : 'var(--ink)';

  return (
    <div className="profile-modal" role="alertdialog" aria-modal="true" aria-label={title}>
      <div className="profile-modal-backdrop" onClick={onClose} />
      <div className="profile-modal-card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <button
          type="button"
          className="profile-modal-close"
          onClick={onClose}
          aria-label="Close"
        >×</button>

        <h2 style={{ color: accent }}>{title}</h2>
        <p className="profile-modal-sub" style={{ marginBottom: 22, fontSize: 15 }}>
          {message}
        </p>

        <div className="profile-actions" style={{ justifyContent: 'center' }}>
          {primary && (
            <button
              type="button"
              className="profile-btn profile-btn-primary"
              onClick={() => { primary.onClick?.(); onClose?.(); }}
            >
              {primary.label}
            </button>
          )}
          <button type="button" className="profile-btn-ghost" onClick={onClose}>
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
