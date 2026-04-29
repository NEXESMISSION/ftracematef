import { useState } from 'react';
import SvgDefs from '../components/SvgDefs.jsx';
import Nav from '../components/Nav.jsx';
import Hero from '../components/Hero.jsx';
import Marquee from '../components/Marquee.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import Gallery from '../components/Gallery.jsx';
import Pricing from '../components/Pricing.jsx';
import Footer from '../components/Footer.jsx';
import WelcomeOverlay from '../components/WelcomeOverlay.jsx';
import CatPopup from '../components/CatPopup.jsx';
import VideoModal from '../components/VideoModal.jsx';

export default function Landing() {
  const [video, setVideo] = useState({ open: false, id: '' });

  const openVideo = (id) => setVideo({ open: true, id });
  const closeVideo = () => setVideo({ open: false, id: '' });

  return (
    <>
      <SvgDefs />
      <Nav />
      <Hero onPlayClick={openVideo} />
      <Marquee />
      <HowItWorks />
      <Gallery />
      <Pricing />
      <WelcomeOverlay />
      <CatPopup />
      <VideoModal open={video.open} videoId={video.id} onClose={closeVideo} />
      <Footer />
    </>
  );
}
