import React, { useRef, useState, useEffect } from 'react';
import { preloadVideo, generateVideoPoster, isVideoCached, getCachedVideo } from '../utils/videoPreloader';
import { generateGradientPlaceholder } from '../utils/generatePlaceholders';

interface UseOptimizedVideoProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  preloadStrategy?: 'auto' | 'metadata' | 'none';
  priority?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

interface UseOptimizedVideoReturn {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  isLoading: boolean;
  isPlaying: boolean;
  error: Error | null;
  dynamicPoster: string;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
}

/**
 * Custom hook for optimized video loading and playback
 */
export function useOptimizedVideo({
  src,
  poster,
  autoPlay = false,
  muted = true,
  loop = false,
  preloadStrategy = 'metadata',
  priority = false,
  onLoad,
  onError
}: UseOptimizedVideoProps): UseOptimizedVideoReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [error, setError] = useState<Error | null>(null);
  const [dynamicPoster, setDynamicPoster] = useState<string>(poster || '');
  
  // Generate a placeholder poster if none is provided and try to generate from video
  useEffect(() => {
    const setupPoster = async () => {
      if (!poster && !dynamicPoster) {
        try {
          // Try to generate a poster from the video
          if (src) {
            const generatedPoster = await generateVideoPoster(src);
            setDynamicPoster(generatedPoster);
          } else {
            // Fallback to a placeholder
            const placeholderPoster = generateGradientPlaceholder(640, 360, ['#1e293b', '#334155']);
            setDynamicPoster(placeholderPoster);
          }
        } catch (err) {
          // If poster generation fails, use placeholder
          const placeholderPoster = generateGradientPlaceholder(640, 360, ['#1e293b', '#334155']);
          setDynamicPoster(placeholderPoster);
        }
      }
    };
    
    setupPoster();
  }, [poster, dynamicPoster, src]);
  
  // Preload video when src changes
  useEffect(() => {
    if (!src) return;
    
    const preloadVideoSource = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Check if video is already cached
        if (isVideoCached(src)) {
          const cachedVideo = getCachedVideo(src);
          if (cachedVideo && videoRef.current) {
            // Copy properties from cached video
            videoRef.current.src = cachedVideo.src;
            setIsLoading(false);
            if (onLoad) onLoad();
            return;
          }
        }
        
        // Preload the video
        await preloadVideo(src, {
          priority,
          metadata: preloadStrategy === 'metadata'
        });
        
        if (videoRef.current) {
          videoRef.current.src = src;
          setIsLoading(false);
          if (onLoad) onLoad();
        }
      } catch (err) {
        console.error('Error preloading video:', err);
        setIsLoading(false);
        const newError = err instanceof Error ? err : new Error('Failed to preload video');
        setError(newError);
        if (onError) onError(newError);
      }
    };
    
    preloadVideoSource();
  }, [src, priority, preloadStrategy, onLoad, onError]);
  
  // Set up video element event listeners
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    const handleLoadStart = () => {
      setIsLoading(true);
      setError(null);
    };
    
    const handleLoadedData = () => {
      setIsLoading(false);
      if (onLoad) onLoad();
      
      // If autoPlay is true, start playing
      if (autoPlay) {
        videoElement.play().catch(err => {
          console.warn('Auto-play was prevented:', err);
          setIsPlaying(false);
        });
      }
    };
    
    const handleError = (_: Event) => {
      setIsLoading(false);
      const newError = new Error('Failed to load video');
      setError(newError);
      if (onError) onError(newError);
    };
    
    const handlePlay = () => {
      setIsPlaying(true);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
    };
    
    // Add event listeners
    videoElement.addEventListener('loadstart', handleLoadStart);
    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('error', handleError);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    
    // Set attributes
    videoElement.muted = muted;
    videoElement.loop = loop;
    videoElement.preload = preloadStrategy;
    
    // If priority is true, preload the video
    if (priority) {
      videoElement.preload = 'auto';
    }
    
    // Clean up event listeners
    return () => {
      videoElement.removeEventListener('loadstart', handleLoadStart);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
      videoElement.removeEventListener('error', handleError);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [autoPlay, loop, muted, onError, onLoad, preloadStrategy, priority]);
  
  // Play function
  const play = async () => {
    if (videoRef.current) {
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Error playing video:', err);
        setIsPlaying(false);
      }
    }
  };
  
  // Pause function
  const pause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };
  
  // Toggle play/pause
  const togglePlay = () => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };
  
  return {
    videoRef,
    isLoading,
    isPlaying,
    error,
    dynamicPoster,
    play,
    pause,
    togglePlay
  };
}
