import { useState } from 'react';
import InstallModal from './InstallModal.jsx';
import Img from './Img.jsx';

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
          Add it to your home screen — opens in one tap, no app store needed.
        </p>

        <div className="get-app-buttons">
          <button
            type="button"
            className="store-btn"
            onClick={() => open('ios')}
            aria-label="Install on iPhone"
          >
            <Img src="/images/store/ios.webp" alt="Install on iPhone" />
          </button>

          <button
            type="button"
            className="store-btn"
            onClick={() => open('android')}
            aria-label="Install on Android"
          >
            <Img src="/images/store/android.webp" alt="Install on Android" />
          </button>
        </div>
      </div>

      <InstallModal platform={platform} onClose={close} />
    </section>
  );
}
