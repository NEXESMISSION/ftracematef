import React, { useState, useEffect, useRef } from 'react';

interface OptimizedVideoProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  onLoad?: () => void;
  onError?: () => void;
  fallbackSrc?: string;
}

const OptimizedVideo: React.FC<OptimizedVideoProps> = ({
  src,
  poster,
  className = '',
  autoPlay = false,
  muted = true,
  loop = false,
  playsInline = true,
  preload = 'metadata',
  onLoad,
  onError,
  fallbackSrc
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Intersection Observer to lazy load videos
  useEffect(() => {
    if (!videoRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before the video comes into view
        threshold: 0.1
      }
    );

    observerRef.current.observe(videoRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Load video when visible
  useEffect(() => {
    if (isVisible && !currentSrc) {
      setCurrentSrc(src);
    }
  }, [isVisible, src, currentSrc]);

  // Handle video load events
  const handleLoadedData = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    if (fallbackSrc && currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    } else {
      onError?.();
    }
  };

  // Preload video when it comes into view
  useEffect(() => {
    if (isVisible && videoRef.current && currentSrc) {
      // Set video source
      videoRef.current.src = currentSrc;
      
      // Preload metadata for faster start
      videoRef.current.preload = preload;
      
      // If autoplay is enabled, try to play immediately
      if (autoPlay) {
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            // Autoplay failed, but that's okay
            console.log('Autoplay prevented, user interaction required');
          });
        }
      }
    }
  }, [isVisible, currentSrc, autoPlay, preload]);

  return (
    <div className={`relative ${className}`}>
      {/* Loading placeholder */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      )}
      
      {/* Error placeholder */}
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
          <div className="text-white text-center">
            <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-sm">Video failed to load</p>
          </div>
        </div>
      )}
      
      <video
        ref={videoRef}
        className={`w-full h-full object-cover ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`}
        poster={poster}
        muted={muted}
        loop={loop}
        playsInline={playsInline}
        onLoadedData={handleLoadedData}
        onError={handleError}
        controlsList="nodownload noplaybackrate nofullscreen"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center',
          display: 'block'
        }}
      />
    </div>
  );
};

export default OptimizedVideo; 