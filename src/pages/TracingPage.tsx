import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCamera } from '../hooks/useCamera';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { OverlaySettings } from '../types';
import { formatRemainingTime } from '../utils/usageLimits';
import OverlayControls from '../components/OverlayControls';

const TracingPage: React.FC = () => {
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [overlaySettings, setOverlaySettings] = useState<OverlaySettings>({
    opacity: 0.5,
    scale: 1,
    rotation: 0,
    cornerTransforms: {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
    },
  });
  
  // Get camera access using our custom hook
  const { 
    videoRef, 
    isLoading: cameraLoading, 
    error: cameraError, 
    startCamera, 
    switchCamera,
    enableMockCamera
  } = useCamera({ autoStart: true });
  
  // Usage tracking
  const { 
    startSession, 
    endSession, 
    isSessionActive, 
    remainingSessionTime 
  } = useUsageTracking();
  
  // Timer for auto-hiding controls
  const controlsTimerRef = useRef<number | null>(null);
  
  // Get the uploaded image from session storage
  useEffect(() => {
    const imageUrl = sessionStorage.getItem('traceImageUrl');
    const imageData = sessionStorage.getItem('traceImageData');
    
    if (!imageUrl && !imageData) {
      // No image found, redirect back to app main
      navigate('/app');
      return;
    }
    
    // Load the image
    const img = new Image();
    
    // Set up error handling for the image
    img.onerror = () => {
      console.error('Failed to load image');
      // If all attempts fail, redirect back
      navigate('/app');
    };
    
    img.onload = () => {
      overlayImageRef.current = img;
      drawCanvas();
    };
    
    // Try to load from base64 data first (more reliable)
    if (imageData) {
      console.log('Loading image from base64 data');
      img.src = imageData;
    } else if (imageUrl && !imageUrl.startsWith('blob:')) {
      // Only use imageUrl if it's not a blob URL
      console.log('Loading image from URL');
      img.src = imageUrl;
    } else {
      console.error('No valid image source found');
      navigate('/app');
      return;
    }
    
    // Start the usage session
    startSession();
    
    // Clean up function
    return () => {
      if (isSessionActive) {
        endSession();
      }
      
      // Clear the session storage to prevent stale data
      sessionStorage.removeItem('traceImageUrl');
      sessionStorage.removeItem('traceImageData');
      
      // Revoke any blob URLs to prevent memory leaks
      if (imageUrl && imageUrl.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(imageUrl);
        } catch (e) {
          console.error('Error revoking object URL:', e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Set up auto-hide timer for controls
  useEffect(() => {
    if (showControls) {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
      
      controlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    
    return () => {
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, [showControls]);
  
  // Update canvas when settings change
  useEffect(() => {
    drawCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlaySettings]);
  
  // Draw the overlay on the canvas
  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const img = overlayImageRef.current;
    
    if (!canvas || !img) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // If we have a video, draw it first as the background
    if (video && video.readyState >= 2) { // HAVE_CURRENT_DATA or higher
      try {
        // Try to draw the video frame
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        console.error('Error drawing video to canvas:', e);
        // If video drawing fails, fill with a dark background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      // No video available, fill with a dark background
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Set global opacity for the overlay
    ctx.globalAlpha = overlaySettings.opacity;
    
    // Calculate center position
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    
    // Save the current context state
    ctx.save();
    
    // Move to center, rotate, scale, then move back
    ctx.translate(centerX, centerY);
    ctx.rotate((overlaySettings.rotation * Math.PI) / 180);
    ctx.scale(overlaySettings.scale, overlaySettings.scale);
    
    // Draw the image centered
    const imgWidth = img.width;
    const imgHeight = img.height;
    try {
      ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2, imgWidth, imgHeight);
    } catch (e) {
      console.error('Error drawing overlay image to canvas:', e);
    }
    
    // Restore the context
    ctx.restore();
    
    // Reset global alpha
    ctx.globalAlpha = 1.0;
    
    // Request animation frame to keep updating the canvas
    requestAnimationFrame(drawCanvas);
  };
  
  // Handle slider changes
  const handleSettingChange = (
    setting: keyof Omit<OverlaySettings, 'cornerTransforms'>,
    value: number
  ) => {
    setOverlaySettings((prev) => ({
      ...prev,
      [setting]: value,
    }));
    
    // Reset the auto-hide timer
    setShowControls(true);
  };
  
  // Note: Corner transform feature will be implemented in a future update
  // For now, we're focusing on basic overlay adjustments
  
  // Handle camera switch
  const handleCameraSwitch = async () => {
    await switchCamera();
    // Reset the auto-hide timer
    setShowControls(true);
  };
  
  // Handle exit button
  const handleExit = () => {
    // End the session and navigate back to app main
    endSession();
    navigate('/app');
  };
  
  // Resize canvas to match video dimensions
  const handleVideoPlay = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    
    if (!canvas || !video) return;
    
    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Initial draw
    drawCanvas();
  };
  
  // Show controls when tapping on screen
  const handleScreenTap = () => {
    setShowControls(true);
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden relative">
      {/* Camera error message */}
      {cameraError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md text-center">
            <svg className="h-12 w-12 text-red-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {cameraError.includes('No camera found') ? 'No Camera Detected' : 'Camera Access Denied'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {cameraError.includes('No camera found') 
                ? 'TraceMate couldn\'t find a camera on your device. You can still use the app with limited functionality.'
                : 'TraceMate needs camera access to work properly. Please enable camera access in your browser settings.'}
            </p>
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => startCamera()}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 w-full"
              >
                Try Again
              </button>
              {cameraError.includes('No camera found') && (
                <button
                  onClick={() => {
                    // Enable mock camera mode
                    enableMockCamera();
                  }}
                  className="bg-indigo-100 text-indigo-700 px-4 py-2 rounded-md hover:bg-indigo-200 w-full"
                >
                  Continue Without Camera
                </button>
              )}
              <button
                onClick={handleExit}
                className="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 w-full"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Loading indicator */}
      {cameraLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-40">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      )}
      
      {/* Video element (camera feed) */}
      <video 
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
        onPlay={handleVideoPlay}
      />
      
      {/* Canvas overlay for the image */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover touch-none"
        onClick={handleScreenTap}
      />
      
      {/* Exit button - always visible */}
      <button
        onClick={handleExit}
        className="absolute top-4 left-4 bg-gray-800 bg-opacity-70 text-white p-2 rounded-full z-30"
        aria-label="Exit tracing"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      
      {/* Session timer for free users */}
      {userRole === 'free' && (
        <div className="absolute top-4 right-4 bg-gray-800 bg-opacity-70 text-white px-3 py-1 rounded-full text-sm z-30">
          {formatRemainingTime(remainingSessionTime)}
        </div>
      )}
      
      {/* Controls panel */}
      <OverlayControls
        settings={overlaySettings}
        onSettingChange={handleSettingChange}
        onCameraSwitch={handleCameraSwitch}
        visible={showControls}
      />
      
      {/* Tap indicator - shown when controls are hidden */}
      {!showControls && (
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-800 bg-opacity-70 text-white px-3 py-1 rounded-full text-sm z-10 animate-pulse">
          Tap for controls
        </div>
      )}
    </div>
  );
};

export default TracingPage;
