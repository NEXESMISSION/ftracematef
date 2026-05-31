import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocalState } from '../lib/useLocalState.js';

/**
 * A2 — real in-app camera capture (not a file picker).
 *
 * Opens getUserMedia, shows a live preview, and on shutter grabs the current
 * frame to a canvas → File and hands it back via onCapture(file). Works on
 * desktop (webcam) and mobile (rear/front). Switch-camera flips facingMode.
 *
 * Props: open, onClose, onCapture(file), title.
 */
export default function CameraCapture({ open, onClose, onCapture, title = 'Take a photo' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const [facing, setFacing] = useLocalState('tm:capture-facing', 'environment');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  // After the shutter, hold the captured shot for a Use/Retake review step so a
  // tap never instantly commits a blurry/wrong photo.
  const [review, setReview] = useState(null); // { file, url } | null

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    setReady(false);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Your browser blocks camera access. Try Safari or Chrome.');
        return;
      }
      // Tear down any prior stream before requesting a new facing mode.
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings.'
            : 'Could not start the camera. Try a different device or browser.',
        );
      }
    })();

    return () => { cancelled = true; stop(); };
  }, [open, facing, stop]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Front camera previews mirrored; un-mirror so the saved photo matches life.
    if (facing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      setReview({ file, url: URL.createObjectURL(file) });
    }, 'image/jpeg', 0.92);
  };

  const retake = () => {
    if (review?.url) URL.revokeObjectURL(review.url);
    setReview(null);
  };

  const useShot = () => {
    const r = review;
    setReview(null);
    stop();
    onCapture(r.file);
    // The consumed file's object URL is revoked by the caller's own preview
    // lifecycle; revoking here would blank an <img> that may reference it.
  };

  // A picked file (fallback) also goes through the review step for consistency.
  const onFilePicked = (e) => {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (f) setReview({ file: f, url: URL.createObjectURL(f) });
  };

  const closeAll = () => {
    if (review?.url) URL.revokeObjectURL(review.url);
    setReview(null);
    stop();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="cam-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cam-backdrop" onClick={closeAll} />
      <div className="cam-card">
        <div className="cam-head">
          <span className="cam-title">{review ? 'Use this photo?' : title}</span>
          <button type="button" className="cam-x" onClick={closeAll} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 4 L12 12 M12 4 L4 12" />
            </svg>
          </button>
        </div>

        <div className="cam-stage">
          {review
            ? <img className="cam-video" src={review.url} alt="Captured preview" />
            : error
              ? (
                <div className="cam-fallback">
                  <p className="cam-error">{error}</p>
                  {/* No camera / permission denied → pick a file instead so the
                      button is never a dead end. */}
                  <button type="button" className="cam-fallback-btn" onClick={() => fileRef.current?.click()}>
                    Choose a photo instead
                  </button>
                </div>
              )
              : <video ref={videoRef} className={`cam-video ${facing === 'user' ? 'is-mirrored' : ''}`} playsInline muted autoPlay />}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onFilePicked}
          />
        </div>

        {review ? (
          <div className="cam-controls cam-controls-review">
            <button type="button" className="cam-fallback-btn" onClick={retake}>Retake</button>
            <button type="button" className="cam-fallback-btn cam-use-btn" onClick={useShot}>Use photo</button>
          </div>
        ) : !error && (
          <div className="cam-controls">
            <button
              type="button"
              className="cam-flip"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              aria-label="Switch camera"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 7 H7 L9 5 H15 L17 7 H21 a1 1 0 0 1 1 1 V18 a1 1 0 0 1 -1 1 H3 a1 1 0 0 1 -1 -1 V8 a1 1 0 0 1 1 -1 Z" />
                <path d="M12 10 a3 3 0 1 0 3 3" />
                <path d="M15 10 V8 H13" />
              </svg>
            </button>
            <button type="button" className="cam-shutter" onClick={shoot} disabled={!ready} aria-label="Capture photo">
              <span className="cam-shutter-ring" />
            </button>
            <span className="cam-spacer" aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}
