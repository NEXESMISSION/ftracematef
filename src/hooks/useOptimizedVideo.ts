import React, { useRef, useState, useEffect } from 'react';
import { generateVideoPoster } from '../utils/videoPreloader';
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
 * Enhanced to ensure videos continue playing without user intervention
 */
export function useOptimizedVideo({
  src,
  poster,
  autoPlay = false,
  muted: _muted = true,
  loop: _loop = false,
  preloadStrategy: _preloadStrategy = 'metadata',
  priority: _priority = false,
  onLoad,
  onError
}: UseOptimizedVideoProps): UseOptimizedVideoReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [error, setError] = useState<Error | null>(null);
  const [dynamicPoster, setDynamicPoster] = useState<string>(poster || '');
  
  // Generate a placeholder poster if none is provided
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
    
    setIsLoading(true);
    setError(null);
    
    const preloadVideoSource = async () => {
      try {
        // Check both potential paths for the video file
        const potentialPaths = [
          src,
          src.replace('/assets/', '/assests/'),
          src.replace('/assests/', '/assets/')
        ];
        
        // Try to load from each potential path
        for (const path of potentialPaths) {
          try {
            await fetch(path, { method: 'HEAD' });
            // If fetch succeeds, use this path
            if (videoRef.current) {
              videoRef.current.src = path;
              break;
            }
          } catch (err) {
            // Continue to next path
            console.log(`Path ${path} not accessible, trying next...`);
          }
        }
        
        // If video element exists, set up attributes
        if (videoRef.current) {
          // Add mobile-specific attributes directly
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.setAttribute('webkit-playsinline', 'true');
          videoRef.current.setAttribute('x5-playsinline', 'true');
          videoRef.current.setAttribute('x5-video-player-type', 'h5');
          videoRef.current.setAttribute('x5-video-player-fullscreen', 'true');
          
          setIsLoading(false);
          if (onLoad) onLoad();
        }
      } catch (err) {
        console.error('Error preloading video:', err);
        setIsLoading(false);
        
        // Still try to set the source directly
        if (videoRef.current) {
          videoRef.current.src = src;
          videoRef.current.setAttribute('playsinline', 'true');
          
          // Add load handler
          videoRef.current.onloadeddata = () => {
            setError(null);
            if (onLoad) onLoad();
          };
        }
        
        const newError = err instanceof Error ? err : new Error('Failed to preload video');
        setError(newError);
        if (onError) onError(newError);
      }
    };
    
    preloadVideoSource();
  }, [src, onLoad, onError]);
  
  // Set up video element event listeners and force autoplay
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    
    // Keep track of whether component is mounted
    let isMounted = true;
    
    const handleLoadStart = () => {
      if (isMounted) {
        setIsLoading(true);
        setError(null);
      }
    };
    
    const handleLoadedData = () => {
      if (isMounted) {
        setIsLoading(false);
        if (onLoad) onLoad();
        
        // Delay play to avoid AbortError
        setTimeout(() => {
          if (videoElement && isMounted) {
            playWithRetry(videoElement, 5);
          }
        }, 300);
      }
    };
    
    const handleError = (_: Event) => {
      if (isMounted) {
        setIsLoading(false);
        const newError = new Error('Failed to load video');
        setError(newError);
        if (onError) onError(newError);
      }
    };
    
    const handlePlay = () => {
      if (isMounted) setIsPlaying(true);
    };
    
    const handlePause = () => {
      // Only try to auto-play again if component is still mounted
      if (isMounted) {
        setIsPlaying(false);
        setTimeout(() => {
          if (videoElement && isMounted) {
            playWithRetry(videoElement, 3);
          }
        }, 300);
      }
    };
    
    const handleEnded = () => {
      // Ensure video replays when it ends
      if (videoElement && isMounted) {
        videoElement.currentTime = 0;
        // Add delay before replay to prevent AbortError
        setTimeout(() => {
          if (videoElement && isMounted) {
            playWithRetry(videoElement, 3);
          }
        }, 50);
      }
    };
    
    // Function to play with multiple retries
    const playWithRetry = (video: HTMLVideoElement, maxAttempts: number, attempt = 1) => {
      if (!isMounted) return;
      
      try {
        // Check if video can play before attempting
        if (video.readyState >= 2) {
          const playPromise = video.play();
          
          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              if (!isMounted) return;
              
              console.log(`Play attempt ${attempt} failed:`, error?.message || 'Unknown error');
              
              if (attempt < maxAttempts) {
                setTimeout(() => {
                  if (video && isMounted) {
                    video.muted = true; // Ensure muted to help with autoplay
                    playWithRetry(video, maxAttempts, attempt + 1);
                  }
                }, 400 * attempt); // Increasing backoff
              }
            });
          }
        } else {
          // Video not ready yet, wait and retry
          setTimeout(() => {
            if (video && isMounted) {
              playWithRetry(video, maxAttempts, attempt);
            }
          }, 200);
        }
      } catch (err) {
        // Catch synchronous errors and retry
        if (isMounted && attempt < maxAttempts) {
          setTimeout(() => {
            if (video && isMounted) {
              playWithRetry(video, maxAttempts, attempt + 1);
            }
          }, 400 * attempt);
        }
      }
    };
    
    // Add event listeners
    videoElement.addEventListener('loadstart', handleLoadStart);
    videoElement.addEventListener('loadeddata', handleLoadedData);
    videoElement.addEventListener('error', handleError);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('ended', handleEnded);
    
    // Set mandatory attributes to ensure playback
    videoElement.muted = true; // Must be muted for autoplay
    videoElement.loop = true;  // Always loop for continuous playback
    videoElement.autoplay = true;
    videoElement.playsInline = true;
    videoElement.preload = 'auto';
    videoElement.controls = false; // Hide controls
    
    // Delay initial play attempt to avoid AbortError
    const initialPlayTimer = setTimeout(() => {
      if (videoElement && isMounted) {
        playWithRetry(videoElement, 5);
      }
    }, 500);
    
    // Clean up event listeners and timers
    return () => {
      isMounted = false;
      clearTimeout(initialPlayTimer);
      
      if (videoElement) {
        videoElement.removeEventListener('loadstart', handleLoadStart);
        videoElement.removeEventListener('loadeddata', handleLoadedData);
        videoElement.removeEventListener('error', handleError);
        videoElement.removeEventListener('play', handlePlay);
        videoElement.removeEventListener('pause', handlePause);
        videoElement.removeEventListener('ended', handleEnded);
      }
    };
  }, [src, onLoad, onError]); // We intentionally exclude autoPlay, loop, muted, etc. as we enforce specific values
  
  // Play function with retry logic
  const play = async () => {
    if (videoRef.current) {
      try {
        videoRef.current.muted = true; // Ensure muted for autoplay
        await videoRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('Error playing video:', err);
        
        // Retry with timeout
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch(() => {});
          }
        }, 500);
      }
    }
  };
  
  // Pause function - we immediately play again to prevent pausing
  const pause = () => {
    // Do nothing to prevent user from pausing
    play(); // Just play instead of pausing
  };
  
  // Toggle play/pause - we always play
  const togglePlay = () => {
    play(); // Always play, regardless of current state
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
