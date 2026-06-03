import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import InstallModal from './InstallModal.jsx';
import Img from './Img.jsx';
import {
  isStandalone,
  isInstallPromptAvailable,
  onInstallAvailability,
  promptInstall,
  trackInstall,
} from '../lib/track.js';

/**
 * Account-page install promo. A floating "Install app" button that opens a
 * popup mirroring the landing page's "Get Trace Mate on your phone" section —
 * the iOS / Android store buttons that lead into the step-by-step InstallModal.
 *
 * When the browser has offered a native install prompt (Android / desktop
 * Chrome), the popup also surfaces a one-tap "Install now" button that fires it
 * directly. Every step feeds the PWA funnel in Pulse (see lib/track.trackInstall).
 *
 * Hidden entirely when the app is already running installed (standalone), since
 * there's nothing left to install.
 */
export default function InstallPromo() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(null); // 'ios' | 'android' for InstallModal
  const [canPrompt, setCanPrompt] = useState(isInstallPromptAvailable());

  // The native-prompt availability can flip after mount (beforeinstallprompt
  // often fires a beat after load), so subscribe and re-read.
  useEffect(() => onInstallAvailability(() => setCanPrompt(isInstallPromptAvailable())), []);

  // Don't pester users who already installed.
  if (isStandalone()) return null;

  const openPromo = () => {
    setOpen(true);
    trackInstall('pwa_promo_open');
  };
  const closePromo = () => setOpen(false);

  const pick = (p) => {
    trackInstall(p === 'ios' ? 'pwa_pick_ios' : 'pwa_pick_android');
    setPlatform(p);
  };

  const installNative = async () => {
    const outcome = await promptInstall();
    // Accepted → appinstalled will fire and the standalone guard hides us next
    // load; either way close the popup so we don't dangle over the chrome.
    if (outcome) closePromo();
  };

  return (
    <>
      <button
        type="button"
        className="install-fab"
        onClick={openPromo}
        aria-label="Install the Trace Mate app"
      >
        <svg className="install-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3 V15 M7 10 L12 15 L17 10" />
          <path d="M5 19 H19" />
        </svg>
        <span className="install-fab-label">Install app</span>
      </button>

      {open && createPortal(
        <div className="install-promo" role="dialog" aria-modal="true" aria-label="Install Trace Mate">
          <div className="install-promo-backdrop" onClick={closePromo} />
          <div className="install-promo-card">
            <button type="button" className="install-promo-close" aria-label="Close" onClick={closePromo}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6 L18 18 M18 6 L6 18" />
              </svg>
            </button>

            <h2 className="install-promo-title">
              Get <em>Trace Mate</em> on your phone
            </h2>
            <p className="install-promo-sub">
              Add it to your home screen — opens in one tap, no app store needed.
            </p>

            {canPrompt && (
              <button type="button" className="install-promo-native" onClick={installNative}>
                <span aria-hidden="true">⚡</span> Install now
              </button>
            )}

            <div className="install-promo-buttons">
              <button
                type="button"
                className="store-btn"
                onClick={() => pick('ios')}
                aria-label="Install on iPhone"
              >
                <Img src="/images/store/ios.webp" alt="Install on iPhone" />
              </button>
              <button
                type="button"
                className="store-btn"
                onClick={() => pick('android')}
                aria-label="Install on Android"
              >
                <Img src="/images/store/android.webp" alt="Install on Android" />
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <InstallModal platform={platform} onClose={() => setPlatform(null)} />
    </>
  );
}
