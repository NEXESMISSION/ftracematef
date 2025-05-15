/**
 * Video Preloader Utility
 * 
 * This utility provides functions to preload and cache videos for faster playback.
 * It uses the browser's cache and IndexedDB for efficient storage and retrieval.
 */

/**
 * Interface for video preloading options
 */
export interface PreloadOptions {
  timeout?: number;
  highPriority?: boolean;
  metadata?: boolean;
  fallbackSources?: string[];
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const videoCache = new Map<string, HTMLVideoElement>();

/**
 * Check if a file exists by making a HEAD request
 * @param url URL to check
 * @returns Promise that resolves to true if file exists
 */
const checkFileExists = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
};

/**
 * Preloads a video and returns a promise that resolves when the video is ready to play
 * @param src Video source URL
 * @param options Preload options
 * @returns Promise that resolves with the video element
 */
const preloadVideo = (src: string, options: PreloadOptions = {}): Promise<HTMLVideoElement> => {
  // If already in cache, return it
  if (videoCache.has(src)) {
    return Promise.resolve(videoCache.get(src)!);
  }

  const {
    timeout = DEFAULT_TIMEOUT,
    highPriority = false,
    metadata = false,
    fallbackSources = []
  } = options;

  // Preload the video
  return new Promise(async (resolve, reject) => {
    // First check if the file exists
    const fileExists = await checkFileExists(src);
    
    // If file doesn't exist and we have fallbacks, try them
    if (!fileExists && fallbackSources.length > 0) {
      // Try fallback sources one by one
      for (const fallbackSrc of fallbackSources) {
        const fallbackExists = await checkFileExists(fallbackSrc);
        if (fallbackExists) {
          // If fallback exists, use it instead
          return preloadVideo(fallbackSrc, options)
            .then(resolve)
            .catch(reject);
        }
      }
    }
    
    const video = document.createElement('video');
    video.preload = metadata ? 'metadata' : 'auto';
    video.playsInline = true;
    video.muted = true;
    
    // Add mobile-specific attributes
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('x5-playsinline', 'true');
    video.setAttribute('x5-video-player-type', 'h5');
    video.setAttribute('x5-video-player-fullscreen', 'true');

    // Set up timeout
    const timeoutId = setTimeout(() => {
      // If we have fallbacks, try them instead of rejecting
      if (fallbackSources.length > 0) {
        clearTimeout(timeoutId);
        // Try the first fallback
        preloadVideo(fallbackSources[0], {
          ...options,
          fallbackSources: fallbackSources.slice(1) // Remove the first fallback
        })
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Timeout preloading video: ${src}`));
      }
    }, timeout);

    // Set up event listeners
    video.addEventListener('canplaythrough', () => {
      clearTimeout(timeoutId);
      videoCache.set(src, video);
      resolve(video);
    });

    video.addEventListener('loadedmetadata', () => {
      if (metadata) {
        clearTimeout(timeoutId);
        videoCache.set(src, video);
        resolve(video);
      }
    });

    video.addEventListener('error', () => {
      clearTimeout(timeoutId);
      
      // If we have fallbacks, try them instead of rejecting
      if (fallbackSources.length > 0) {
        // Try the first fallback
        preloadVideo(fallbackSources[0], {
          ...options,
          fallbackSources: fallbackSources.slice(1) // Remove the first fallback
        })
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error(`Failed to preload video: ${src}`));
      }
    });

    // Start loading
    video.src = src;
    
    // If high priority, try to load a bit of the video
    if (highPriority) {
      video.load();
    }
  });
};

/**
 * Preloads multiple videos in parallel
 * 
 * @param sources Array of video source URLs
 * @param options Preload options
 * @returns Promise that resolves when all videos are preloaded
 */
export const preloadVideos = (sources: string[], options: PreloadOptions = {}): Promise<HTMLVideoElement[]> => {
  return Promise.all(sources.map(src => preloadVideo(src, options)));
};

/**
 * Checks if a video is already in the cache
 * 
 * @param src Video source URL
 * @returns Boolean indicating if the video is cached
 */
export const isVideoCached = (src: string): boolean => {
  return videoCache.has(src);
};

/**
 * Gets a video from the cache
 * 
 * @param src Video source URL
 * @returns Cached video element or null if not found
 */
export const getCachedVideo = (src: string): HTMLVideoElement | null => {
  return videoCache.get(src) || null;
};

/**
 * Clears the video cache
 * 
 * @param src Optional specific video source to clear, if not provided clears all
 */
export const clearVideoCache = (src?: string): void => {
  if (src) {
    videoCache.delete(src);
  } else {
    videoCache.clear();
  }
};

/**
 * Generates a poster image from a video
 * 
 * @param videoSrc Video source URL
 * @param time Time in seconds to capture the frame
 * @returns Promise that resolves with the poster image data URL
 */
export const generateVideoPoster = async (videoSrc: string, time: number = 1): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    
    video.addEventListener('loadeddata', () => {
      try {
        video.currentTime = time;
      } catch (err) {
        reject(new Error('Could not set video current time'));
      }
    });
    
    video.addEventListener('seeked', () => {
      // Create canvas and draw video frame
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to data URL
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      } catch (err) {
        reject(new Error('Could not generate poster image'));
      }
    });
    
    video.addEventListener('error', () => {
      reject(new Error('Error loading video for poster generation'));
    });
    
    video.src = videoSrc;
    video.load();
  });
};

/**
 * Preloads all videos on the page
 * 
 * @param prioritySelector CSS selector for high priority videos
 * @param options Preload options
 */
export const preloadPageVideos = (prioritySelector: string = 'video[data-priority="true"]', options: PreloadOptions = {}): void => {
  // First preload high priority videos
  const priorityVideos = Array.from(document.querySelectorAll(prioritySelector)) as HTMLVideoElement[];
  
  priorityVideos.forEach(video => {
    if (video.src && !isVideoCached(video.src)) {
      preloadVideo(video.src, { ...options, highPriority: true });
    }
  });
  
  // Then preload other videos
  const otherVideos = Array.from(document.querySelectorAll('video:not([data-priority="true"])')) as HTMLVideoElement[];
  
  otherVideos.forEach(video => {
    if (video.src && !isVideoCached(video.src)) {
      // Use requestIdleCallback if available, otherwise setTimeout
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => {
          preloadVideo(video.src, { ...options, highPriority: false });
        });
      } else {
        setTimeout(() => {
          preloadVideo(video.src, { ...options, highPriority: false });
        }, 1000);
      }
    }
  });
};

export default {
  preloadVideo,
  preloadVideos,
  isVideoCached,
  getCachedVideo,
  clearVideoCache,
  generateVideoPoster,
  preloadPageVideos
};
