import { useState } from 'react';
import InstallModal from './InstallModal.jsx';

export default function GetApp() {
  const [platform, setPlatform] = useState(null);
  const open = (p) => setPlatform(p);
  const close = () => setPlatform(null);

  return (
    <section className="get-app tm-section-pad" id="get-app">
      <div className="get-app-inner">
        <h2 className="get-app-title">
          Get <em>Trace Mate</em> on your phone
        </h2>
        <p className="get-app-sub">
          Install it like a native app — works offline, opens with one tap.
        </p>

        <div className="get-app-buttons">
          <button
            type="button"
            className="store-btn"
            onClick={() => open('ios')}
            aria-label="Install on iPhone"
          >
            <img src="/images/store/ios.webp" alt="Install on iPhone" />
          </button>

          <button
            type="button"
            className="store-btn"
            onClick={() => open('android')}
            aria-label="Install on Android"
          >
            <img src="/images/store/android.webp" alt="Install on Android" />
          </button>
        </div>
      </div>

      <InstallModal platform={platform} onClose={close} />
    </section>
  );
}
