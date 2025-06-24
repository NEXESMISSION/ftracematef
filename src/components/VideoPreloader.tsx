import React, { useEffect, useRef } from 'react';

interface VideoPreloaderProps {
  videos: string[];
  onProgress?: (loaded: number, total: number) => void;
  onComplete?: () => void;
}

const VideoPreloader: React.FC<VideoPreloaderProps> = ({ 
  videos, 
  onProgress, 
  onComplete 
}) => {
  const loadedCount = useRef(0);
  const totalVideos = videos.length;

  useEffect(() => {
    if (totalVideos === 0) {
      onComplete?.();
      return;
    }

    const preloadVideo = (src: string): Promise<void> => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';
        
        video.onloadedmetadata = () => {
          loadedCount.current++;
          onProgress?.(loadedCount.current, totalVideos);
          
          if (loadedCount.current === totalVideos) {
            onComplete?.();
          }
          resolve();
        };
        
        video.onerror = () => {
          // Even if video fails to load, count it as loaded to avoid blocking
          loadedCount.current++;
          onProgress?.(loadedCount.current, totalVideos);
          
          if (loadedCount.current === totalVideos) {
            onComplete?.();
          }
          resolve();
        };
        
        video.src = src;
      });
    };

    // Preload all videos in parallel
    Promise.all(videos.map(preloadVideo));
  }, [videos, totalVideos, onProgress, onComplete]);

  return null; // This component doesn't render anything
};

export default VideoPreloader; 