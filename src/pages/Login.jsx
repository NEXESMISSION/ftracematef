import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';

export default function Login() {
  // Apply auth-body class to <body> while this page is mounted
  useEffect(() => {
    document.body.classList.add('auth-body');
    return () => document.body.classList.remove('auth-body');
  }, []);

  const handleGoogle = () => {
    // TODO: trigger Google OAuth here.
    // window.location.href = '/auth/google';
    console.log('Google sign-in clicked');
  };

  return (
    <>
      <SvgDefs />

      <Link to="/" className="auth-back" aria-label="Back to home">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 2 L3 7 L8 12 M3 7 H12" />
        </svg>
        Back
      </Link>

      <main className="auth-shell">
        <section className="auth-card" id="authCard">
          <Link to="/" className="auth-hero" aria-label="Welcome to Trace Mate — back to home">
            <img src="/images/auth/welcome.webp" alt="Welcome to tracemate.art" />
          </Link>

          <button type="button" className="google-btn" onClick={handleGoogle}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
            </svg>
            Continue with Google
          </button>

          <p className="auth-fineprint">
            By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy</a>.
          </p>
        </section>

        <img className="auth-side-cat" src="/images/popup/floating-cat.webp" alt="" aria-hidden="true" />
      </main>
    </>
  );
}
