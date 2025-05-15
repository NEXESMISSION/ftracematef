import React from 'react';
import { useOptimizedVideo } from '../hooks/useOptimizedVideo';

type VideoSource = string | { src: string; type: string };
type VideoSourceType = VideoSource | VideoSource[];

const formatSrc = (src: string): string => {
  // Clean and format source URL if needed
  return src;
};

interface OptimizedVideoPlayerProps {
  sources: VideoSourceType;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  preload?: 'auto' | 'metadata' | 'none';
  priority?: boolean;
  preloadStrategy?: 'auto' | 'metadata' | 'none';
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

const OptimizedVideoPlayer: React.FC<OptimizedVideoPlayerProps> = ({
  sources,
  poster,
  title = 'Video',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  autoPlay = true,
  muted = true,
  loop = true,
  controls = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  preload = 'auto',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  priority = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  preloadStrategy = 'auto',
  className = '',
  objectFit = 'cover',
  onLoad,
  onError,
}) => {
  // Convert all sources to a standard format
  const normalizedSources = Array.isArray(sources) ? sources : [sources];

  // Convert to { src, type } format
  const processedSources = normalizedSources.map(source => {
    if (typeof source === 'string') {
      const extension = source.includes('.') ? source.split('.').pop() : 'mp4';
      return {
        src: formatSrc(source),
        type: `video/${extension}`
      };
    } else {
      return {
        src: formatSrc(source.src),
        type: source.type
      };
    }
  });

  // Use the custom hook for optimized video loading
  const {
    videoRef,
    isLoading,
    isPlaying,
    error,
    dynamicPoster,
    togglePlay
  } = useOptimizedVideo({
    src: processedSources[0].src,
    poster,
    autoPlay: true, // Force autoplay
    muted: true,     // Force muted for autoplay policy
    loop: true,      // Force loop for continuous playback
    onLoad,
    onError
  });

  // Base component styles
  const videoClasses = `w-full h-full ${className}`;
  
  return (
    <div className="relative overflow-hidden">
      {/* Video Element */}
      <video
        ref={videoRef}
        className={videoClasses}
        poster={dynamicPoster}
        muted={muted}
        loop={loop}
        controls={controls}
        style={{ objectFit }}
        playsInline
        title={title}
        aria-label={title}
      >
        {/* Fallback sources for different formats */}
        {processedSources.map((source, index) => (
          <source key={index} src={source.src} type={source.type} />
        ))}
        Your browser does not support HTML video.
      </video>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40 z-10">
          <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 z-10 p-4">
          <div className="text-white text-center">
            <svg className="w-12 h-12 mx-auto mb-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-lg font-bold mb-2">Video Error</p>
            <p className="text-sm opacity-80">{error.message}</p>
          </div>
        </div>
      )}

      {/* Optional play/pause overlay */}
      {!controls && !isLoading && !error && (
        <div 
          className="absolute inset-0 cursor-pointer flex items-center justify-center group"
          onClick={togglePlay}
        >
          {!isPlaying && (
            <div className="bg-black bg-opacity-50 rounded-full p-4 transform transition-transform duration-300 group-hover:scale-110">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OptimizedVideoPlayer;
