import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import SvgDefs from '../components/SvgDefs.jsx';
import LoginModal from '../components/LoginModal.jsx';
import SuccessCelebration from '../components/SuccessCelebration.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  savePendingImage,
  loadPendingImage,
  clearPendingImage,
  hasPendingImage,
  ALLOWED_IMAGE_MIME,
} from '../lib/pendingImage.js';
import { beginTrialSession, canUseFreeTrial } from '../lib/freeTrial.js';

/**
 * /upload — public entry. Anyone can upload an image without signing in.
 * Pressing "Start tracing" routes them depending on auth/billing state:
 *   - Not signed in → opens LoginModal (image stays in sessionStorage)
 *   - Signed in but not paid → /pricing (image stays in sessionStorage)
 *   - Signed in and paid → /trace (image passed via state, also kept in sessionStorage)
 */
export default function Upload() {
  const navigate = useNavigate();
  const { user, profile, isPaid, loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const inputRef = useRef(null);
  const [preview, setPreview]       = useState(null);   // object URL for current preview
  const [fileName, setFileName]     = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError]           = useState('');
  const [savedFile, setSavedFile]   = useState(null);   // raw File, used for preview only
  const [loginOpen, setLoginOpen]   = useState(false);
  const [celebrateOpen, setCelebrateOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('upload-body');
    return () => document.body.classList.remove('upload-body');
  }, []);

  // Show the celebration popup after a successful payment.
  // Trigger conditions: ?welcome=1 in the URL AND the user is actually
  // confirmed paid (we already verified this on /checkout/success before
  // redirecting here, but we re-check so a manually-typed ?welcome=1
  // can't fake a celebration).
  useEffect(() => {
    if (searchParams.get('welcome') !== '1') return;
    if (loading) return;          // wait for auth to settle
    if (!isPaid) {
      // Strip the param if the user isn't actually paid (e.g. shared link).
      setSearchParams({}, { replace: true });
      return;
    }
    setCelebrateOpen(true);
  }, [searchParams, loading, isPaid, setSearchParams]);

  const closeCelebrate = () => {
    setCelebrateOpen(false);
    // Clean the query param so a refresh doesn't replay the celebration.
    if (searchParams.get('welcome') === '1') {
      setSearchParams({}, { replace: true });
    }
  };

  const onCelebratePrimary = () => {
    closeCelebrate();
    // If the user already had an image queued before paying, take them
    // straight to /trace. Otherwise just dismiss so they can pick one.
    if (hasPendingImage()) {
      const pending = loadPendingImage();
      navigate('/trace', {
        state: pending ? { imageUrl: pending.dataUrl, fileName: pending.name } : undefined,
      });
    }
  };

  // On first mount, if the user previously uploaded an image (e.g. they
  // signed in and came back), restore the preview from sessionStorage.
  useEffect(() => {
    const pending = loadPendingImage();
    if (pending && !preview) {
      setPreview(pending.dataUrl);
      setFileName(pending.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptFile = async (file) => {
    if (!file) return;
    // Strict allowlist of raster image MIME types. SVG is NOT accepted —
    // it's an XML format that can carry foreignObject/scripts and isn't
    // useful as an AR overlay reference anyway. Same allowlist is enforced
    // in lib/pendingImage.js when reading back.
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      setError('Please pick a JPG, PNG, WebP, GIF, HEIC, or AVIF image (no SVG).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError('Image is too large — keep it under 25 MB.');
      return;
    }
    setError('');
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview);

    // Show an instant blob preview while we save the persistent copy.
    const blobUrl = URL.createObjectURL(file);
    setPreview(blobUrl);
    setFileName(file.name);
    setSavedFile(file);

    // Persist to sessionStorage so the image survives the OAuth + payment
    // round-trips. If too big to persist, we still let them trace right
    // away (just won't survive a redirect).
    const saved = await savePendingImage(file);
    if (!saved) {
      console.warn('[upload] image too large to persist across redirects');
    }
  };

  const onPick = (e) => acceptFile(e.target.files?.[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };

  const clearImage = () => {
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName('');
    setSavedFile(null);
    clearPendingImage();
    if (inputRef.current) inputRef.current.value = '';
  };

  const startTracing = () => {
    if (!preview) return;

    // Wait for auth to load before deciding where to go.
    if (loading) return;

    // Route based on user state.
    if (!user) {
      setLoginOpen(true);            // not signed in → modal
      return;
    }
    // Signed in + paid → straight to trace.
    // Signed in + free WITH unused/active free trial → also straight to trace
    // (the trial gets stamped inside <Trace /> on first mount).
    // Signed in + free + trial used → /pricing.
    if (!isPaid && !canUseFreeTrial(profile)) {
      navigate('/pricing');
      return;
    }
    // Free user using their one shot — mark this tab as the active trial
    // session BEFORE we navigate so RequirePaid's first render (and every
    // render after the post-stamp profile update) resolves to 'active'
    // rather than 'used'. RequirePaid does this defensively too, but doing
    // it here as well covers the path where the navigation completes
    // before RequirePaid's render cycle has run.
    if (!isPaid) beginTrialSession();
    navigate('/trace', { state: { imageUrl: preview, fileName } });
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

      <main className="upload-shell">
        <section className="upload-card">
          <span className="auth-eyebrow">
            <span className="auth-eyebrow-dot" aria-hidden="true">✦</span>
            Step 1 of 2
          </span>

          <h1 className="upload-title">
            Pick an image to <em>trace</em>
          </h1>
          <p className="upload-sub">
            Any reference works — a sketch, photo, or screenshot.
            We'll overlay it on your camera view.
          </p>

          {!preview ? (
            <label
              className={`upload-drop ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={onDragOver}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/bmp"
                onChange={onPick}
                className="upload-input"
              />
              <span className="upload-drop-icon" aria-hidden="true">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 24 V8 M11 15 L18 8 L25 15" />
                  <path d="M6 24 V28 a2 2 0 0 0 2 2 H28 a2 2 0 0 0 2 -2 V24" />
                </svg>
              </span>
              <strong className="upload-drop-title">Drop an image here</strong>
              <span className="upload-drop-or">or click to browse</span>
              <span className="upload-drop-meta">JPG · PNG · WebP — up to 25 MB</span>
            </label>
          ) : (
            <div className="upload-preview">
              <img src={preview} alt="Selected reference" />
              <button type="button" className="upload-change-btn" onClick={clearImage}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 8 a5.5 5.5 0 1 0 1.7 -3.9 M2.5 2.5 V5.2 H5.2" />
                </svg>
                Choose a different image
              </button>
            </div>
          )}

          {error && <p className="upload-error">{error}</p>}

          <button
            type="button"
            className="upload-cta"
            disabled={!preview || loading}
            onClick={startTracing}
          >
            Start tracing
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 8 H13 M9 4 L13 8 L9 12" />
            </svg>
          </button>

          <p className="upload-fineprint">
            Your image stays on your device — we don't upload it.
          </p>
        </section>

        <img className="auth-side-cat" src="/images/popup/floating-cat.webp" alt="" aria-hidden="true" />
      </main>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        intentLabel="Sign in to start tracing"
      />

      <SuccessCelebration
        open={celebrateOpen}
        onClose={closeCelebrate}
        onPrimary={onCelebratePrimary}
        primaryLabel={hasPendingImage() ? 'Start tracing' : 'Pick an image'}
        title="You're in!"
        subtitle={
          hasPendingImage()
            ? "Welcome to Trace Mate. Your studio is unlocked — your image is ready to trace."
            : "Welcome to Trace Mate. Your studio is unlocked — pick an image and start tracing."
        }
      />
    </>
  );
}
