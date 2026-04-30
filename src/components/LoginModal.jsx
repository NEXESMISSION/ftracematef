import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Lightweight login overlay used by /upload (and anywhere else we want a
 * popup-style sign-in instead of a full /login page navigation).
 *
 * After the user clicks "Continue with Google" the browser does a full
 * redirect to Google → /auth/callback. The image they uploaded survives
 * via sessionStorage (see lib/pendingImage.js).
 */
export default function LoginModal({ open, onClose, intentLabel = 'Sign in to continue' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Lock body scroll while the modal is open + close on Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleGoogle = async () => {
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setBusy(false);
      setError(error.message || 'Could not start sign-in.');
    }
    // On success the browser navigates to Google — code below never runs.
  };

  return (
    <div className="login-modal" role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="login-modal-backdrop" onClick={onClose}></div>

      <section className="login-modal-card">
        <button type="button" className="login-modal-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round">
            <path d="M4 4 L12 12 M12 4 L4 12" />
          </svg>
        </button>

        <img
          className="login-modal-hero"
          src="/images/auth/welcome-480.webp"
          srcSet="/images/auth/welcome-480.webp 480w, /images/auth/welcome.webp 694w"
          sizes="220px"
          width="480"
          height="474"
          alt="Welcome to tracemate.art"
          fetchpriority="high"
          decoding="async"
          loading="eager"
        />

        <p className="login-modal-intent">{intentLabel}</p>

        <button type="button" className="google-btn" onClick={handleGoogle} disabled={busy}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
            <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
            <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
          </svg>
          {busy ? 'Redirecting to Google…' : 'Continue with Google'}
        </button>

        {error && <p className="auth-error">{error}</p>}

        <p className="auth-fineprint">
          By continuing, you agree to our Terms and Privacy policy.
          Your uploaded image is preserved.
        </p>
      </section>
    </div>
  );
}
