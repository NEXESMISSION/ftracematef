import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOptimizedVideo } from '../hooks/useOptimizedVideo';

interface VideoSource {
  src: string;
  type: string;
}

type VideoSourceType = VideoSource | VideoSource[] | string;

interface OptimizedVideoPlayerProps {
  sources: VideoSourceType;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  priority?: boolean;
  preloadStrategy?: 'auto' | 'metadata' | 'none';
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

/**
 * OptimizedVideoPlayer - A performance-optimized video player component
 */
const OptimizedVideoPlayer: React.FC<OptimizedVideoPlayerProps> = ({
  sources,
  poster,
  title = 'Video',
  // We're not using these props directly as they're hardcoded in the hook
  // but we keep them in the interface for API consistency
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  autoPlay = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loop = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  muted = true,
  controls = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  priority = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  preloadStrategy = 'metadata',
  className = '',
  objectFit = 'cover',
  onLoad,
  onError
}) => {
  // Normalize sources to array format
  let normalizedSources: VideoSource[] = [];
  
  // Safely extract file extension
  const getFileExtension = (path: string): string => {
    return path.indexOf('.') !== -1 ? path.split('.').pop() || 'mp4' : 'mp4';
  };

  if (typeof sources === 'string') {
    // Handle string source
    // Keep assests in the path since this is where the actual files are
    normalizedSources = [{ 
      src: sources, 
      type: `video/${getFileExtension(sources)}` 
    }];
  } else if (Array.isArray(sources)) {
    // Handle array of sources
    normalizedSources = sources.map(source => {
      if (typeof source === 'string') {
        return {
          src: source,
          type: `video/${getFileExtension(source)}`
        };
      } else {
        return {
          src: source.src,
          type: source.type
        };
      }
    });
  } else if (sources && typeof sources === 'object') {
    // Handle single VideoSource object
    normalizedSources = [{
      src: sources.src,
      type: sources.type
    }];
  }
  
  // Use our optimized video hook
  const {
    videoRef,
    isLoading,
    isPlaying,
    error,
    dynamicPoster,
    // We're not using these directly but keeping them for future use
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    play,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    pause,
    togglePlay
  } = useOptimizedVideo({
    src: normalizedSources[0].src,
    poster,
    autoPlay: true, // Force autoplay to ensure videos always play
    muted: true, // Always mute to allow autoplay on all devices
    loop: true, // Always loop to ensure continuous playback
    preloadStrategy: 'auto', // Always preload for better performance
    priority: true, // Always prioritize video loading
    onLoad,
    onError
  });
  
  // State for hover
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div 
      className={`relative overflow-hidden ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Loading indicator */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm z-10"
          >
            <div className="flex flex-col items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-2"></div>
              <span className="text-white text-sm">Loading video...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-gray-900/70 backdrop-blur-sm z-10"
          >
            <div className="bg-red-900/80 text-white p-4 rounded-lg max-w-xs text-center">
              <svg className="h-8 w-8 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p>Failed to load video</p>
              <button 
                className="mt-2 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Play/Pause overlay */}
      {!controls && (
        <AnimatePresence>
          {(isHovered || !isPlaying) && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/30 z-10 cursor-pointer"
              onClick={togglePlay}
            >
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                whileHover={{ scale: 1.1 }}
                className="bg-black/50 backdrop-blur-sm rounded-full p-4"
              >
                {isPlaying ? (
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
      
      {/* Video element - Enhanced for mobile compatibility */}
      <video
        ref={videoRef}
        className={`w-full h-full object-${objectFit} pointer-events-none select-none`}
        poster={dynamicPoster}
        playsInline
        muted={muted}
        loop={loop}
        controls={controls}
        preload="auto"
        webkit-playsinline="true"
        x5-playsinline="true"
        x5-video-player-type="h5"
        x5-video-player-fullscreen="true"
        aria-label={title}
      >
        {/* Add multiple source formats for better compatibility */}
        {normalizedSources.map((source, index) => {
          // Get the base source without extension
          const baseSrc = source.src.replace(/\.[^/.]+$/, '');
          const fileType = source.src.split('.').pop()?.toLowerCase();
          
          // If it's already an MP4, keep it as is
          if (fileType === 'mp4') {
            return <source key={`${index}-mp4`} src={source.src} type="video/mp4" />;
          }
          
          // Otherwise, provide multiple formats
          return (
            <React.Fragment key={index}>
              <source key={`${index}-mp4`} src={`${baseSrc}.mp4`} type="video/mp4" />
              <source key={`${index}-webm`} src={`${baseSrc}.webm`} type="video/webm" />
              <source key={`${index}-original`} src={source.src} type={source.type} />
            </React.Fragment>
          );
        })}
        Your browser does not support the video tag.
      </video>
    </div>
  );
};

export default OptimizedVideoPlayer;
