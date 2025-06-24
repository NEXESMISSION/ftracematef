import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCamera } from '../hooks/useCamera';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { getVideoDevices } from '../utils/camera';

interface ImageSettings {
  opacity: number;
  scale: number;
  rotation: number;
  positionX: number;
  positionY: number;
}

const TracingPage: React.FC = () => {
  const { user } = useAuth(); // Get user from Auth context
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);
  const [showControls, setShowControls] = useState(true);
  
  // Session time limit alert states
  const [showTimeAlert, setShowTimeAlert] = useState(false);
  const [alertShown, setAlertShown] = useState(false); // Track if alert has been shown
  const [redirectCountdown, setRedirectCountdown] = useState(20);
  const [remainingTime, setRemainingTime] = useState(120); // 2 minutes countdown (120 seconds)
  const [cooldownTime, setCooldownTime] = useState(0); // 24-hour cooldown timer
  const redirectTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null); // Reference for countdown timer
  const cooldownTimerRef = useRef<number | null>(null); // Reference for cooldown timer
  
  // Image settings with position
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    opacity: 0.5,
    scale: 1,
    rotation: 0,
    positionX: 0,
    positionY: 0
  });
  
  // Touch and drag state
  const [touchStartX, setTouchStartX] = useState<number>(0);
  const [touchStartY, setTouchStartY] = useState<number>(0);
  const [initialDistance, setInitialDistance] = useState<number>(0);
  const [initialAngle, setInitialAngle] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPinching, setIsPinching] = useState<boolean>(false);
  const [isRotating, setIsRotating] = useState<boolean>(false);
  
  // Get camera access using our custom hook
  const { 
    videoRef: cameraVideoRef, 
    isLoading: cameraLoading, 
    error: cameraError, 
    startCamera, 
    stopCamera,
    devices: availableCameras,
    getCameraDevices
  } = useCamera({ autoStart: false }) // Don't auto-start, we'll handle it manually
  
  // State to track if camera is active and UI states
  const [isCameraActive, setIsCameraActive] = useState(true); // Start with camera active
  const [showCameraList, setShowCameraList] = useState(false);
  const [showImageSettings, setShowImageSettings] = useState(false);
  
  // Usage tracking
  const { 
    startSession, 
    endSession
  } = useUsageTracking();
  
  // Check if user is logged in
  const isLoggedIn = !!user;
  
  // Get the uploaded image from browser storage (session storage or local storage)
  useEffect(() => {
    console.log('TracingPage mounted - checking for image data');
    
    // Try to get image data from sessionStorage first, then fallback to localStorage
    let imageUrl = sessionStorage.getItem('traceImageUrl');
    let imageData = sessionStorage.getItem('traceImageData');
    
    // If not found in sessionStorage, try localStorage
    if (!imageUrl || !imageData) {
      console.log('Image not found in sessionStorage, checking localStorage...');
      imageUrl = localStorage.getItem('traceImageUrl');
      imageData = localStorage.getItem('traceImageData');
    }
    
    console.log('Browser storage check:', { 
      imageUrlExists: !!imageUrl, 
      imageDataExists: !!imageData,
      imageUrlLength: imageUrl?.length || 0,
      imageDataLength: imageData?.length || 0,
      storageType: imageData ? (sessionStorage.getItem('traceImageData') ? 'sessionStorage' : 'localStorage') : 'none'
    });
    
    if (!imageUrl && !imageData) {
      console.error('No image found in browser storage, redirecting to app page');
      // No image found, redirect back to app main
      navigate('/app');
      return;
    }
    
    loadImage(imageUrl, imageData);
    
    // Only start a session if one isn't already active
    try {
      startSession();
    } catch (error) {
      console.warn('Could not start session:', error);
      // If we hit the session limit, we should still allow the user to use the app
      // but we'll show a warning or limit functionality if needed
    }
    
    // Force start the camera immediately on component mount
    const initCamera = async () => {
      try {
        console.log('Initializing camera...');
        
        // Get available cameras
        const camerasAvailable = await getCameraDevices();
        console.log('Available cameras found:', camerasAvailable);
        
        if (camerasAvailable.length === 0) {
          // No cameras available, show alert
          alert('No camera devices detected. Please allow camera access or connect a camera.');
          console.error('No camera devices available');
          return;
        }
        
        // Find the back camera if available, otherwise use the first camera
        let preferredCamera = camerasAvailable[0].deviceId; // Default to first camera
        
        // Try to find a back-facing camera
        const backCamera = camerasAvailable.find(camera => 
          camera.label?.toLowerCase().includes('back') || 
          camera.label?.toLowerCase().includes('rear')
        );
        
        if (backCamera) {
          preferredCamera = backCamera.deviceId;
          console.log('Using back camera:', backCamera.label);
        } else {
          console.log('No back camera found, using first available camera');
        }
        
        // Directly start camera with the selected camera
        console.log('Starting camera with deviceId:', preferredCamera);
        await startCamera(preferredCamera);
        setIsCameraActive(true);
        
        // Apply styles to ensure video fills container properly
        if (cameraVideoRef.current) {
          console.log('Applying styles to camera view');
          cameraVideoRef.current.style.width = '100%';
          cameraVideoRef.current.style.height = '100%';
          cameraVideoRef.current.style.objectFit = 'cover';
          cameraVideoRef.current.style.objectPosition = 'center';
        }
      } catch (error) {
        console.error('Failed to initialize camera:', error);
        alert('Failed to access camera. Please check your camera permissions and try again.');
      }
    };
    
    // Run the camera initialization immediately
    initCamera();
    
    // Clean up when component unmounts
    return () => {
      // Stop camera if active
      if (isCameraActive) {
        stopCamera();
        setIsCameraActive(false);
      }
      // Clear redirect timer if active
      if (redirectTimerRef.current) {
        window.clearInterval(redirectTimerRef.current);
      }
      endSession();
    };
  }, [navigate]); // Remove dependencies that could cause remounting
  
  // Load the image from storage
  const loadImage = (imageUrl: string | null, imageData: string | null) => {
    const img = new Image();
    
    img.onload = () => {
      console.log('Image loaded successfully, dimensions:', img.width, 'x', img.height);
      overlayImageRef.current = img;
      
      // Center the image on the screen initially
      centerImageOnLoad(img);
      
      // Draw the initial canvas
      drawCanvas();
    };
    
    img.onerror = (e) => {
      console.error('Error loading image:', e);
      navigate('/app');
    };
    
    // Try to load from base64 data first (more reliable)
    if (imageData) {
      console.log('Loading image from base64 data');
      // Store in both storage types to ensure it's available
      try {
        sessionStorage.setItem('traceImageData', imageData);
        localStorage.setItem('traceImageData', imageData);
        if (imageUrl) {
          sessionStorage.setItem('traceImageUrl', imageUrl);
          localStorage.setItem('traceImageUrl', imageUrl);
        }
      } catch (e) {
        console.warn('Failed to update storage with image data', e);
      }
      img.src = imageData;
    } else if (imageUrl && !imageUrl.startsWith('blob:')) {
      // Only use imageUrl if it's not a blob URL
      console.log('Loading image from URL');
      try {
        sessionStorage.setItem('traceImageUrl', imageUrl);
        localStorage.setItem('traceImageUrl', imageUrl);
      } catch (e) {
        console.warn('Failed to update storage with image URL', e);
      }
      img.src = imageUrl;
    } else {
      console.error('No valid image source found');
      navigate('/app');
      return;
    }
  };
  
  // Center the image on load for optimal positioning
  const centerImageOnLoad = (img: HTMLImageElement) => {
    if (!canvasRef.current) return;
    
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;
    
    // Calculate the scaling factor to fit the image within the canvas
    // while maintaining aspect ratio
    const scaleX = canvasWidth / img.width;
    const scaleY = canvasHeight / img.height;
    const scale = Math.min(scaleX, scaleY) * 0.8; // 80% of the max scale for some padding
    
    // For centered positioning, we use 0,0 as the center offset
    // since our drawing logic now uses the canvas center as the reference point
    
    // Update the image settings
    setImageSettings({
      opacity: 0.5,
      scale: scale,
      rotation: 0,
      positionX: 0, // Center position (no offset)
      positionY: 0  // Center position (no offset)
    });
    
    console.log('Image centered with scale:', scale);
  };
  
  // Draw the canvas with the current settings
  const drawCanvas = () => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas dimensions if not already set
    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    
    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // We don't need to draw the camera feed on the canvas as it's shown as a background video element
    // This prevents duplicate camera views
    
    // Draw the overlay image with current settings if available
    if (overlayImageRef.current) {
      const img = overlayImageRef.current;
      
      // Save the current context state
      ctx.save();
      
      // Calculate the center position of the canvas
      const canvasCenterX = canvas.width / 2;
      const canvasCenterY = canvas.height / 2;
      
      // Move to the position where we want to draw the image (center + offset)
      ctx.translate(
        canvasCenterX + imageSettings.positionX,
        canvasCenterY + imageSettings.positionY
      );
      
      // Rotate around this point
      ctx.rotate((imageSettings.rotation * Math.PI) / 180);
      
      // Set the transparency
      ctx.globalAlpha = imageSettings.opacity;
      
      // Draw the image centered at the origin
      try {
        const scaledWidth = img.width * imageSettings.scale;
        const scaledHeight = img.height * imageSettings.scale;
        
        ctx.drawImage(
          img,
          -scaledWidth / 2,  // Center horizontally
          -scaledHeight / 2, // Center vertically
          scaledWidth,
          scaledHeight
        );
      } catch (error) {
        console.error('Error drawing overlay image to canvas:', error);
      }
      
      // Restore the context state
      ctx.restore();
    }
  };
  
  // Touch event handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      // Single touch - prepare for dragging
      setTouchStartX(e.touches[0].clientX);
      setTouchStartY(e.touches[0].clientY);
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      // Two touches - prepare for pinch zoom and rotation
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // Calculate initial distance between touches for scaling
      const initialDist = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      setInitialDistance(initialDist);
      
      // Calculate initial angle for rotation
      const initialAng = Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      ) * 180 / Math.PI;
      setInitialAngle(initialAng);
      
      setIsPinching(true);
      setIsRotating(true);
    }
    
    // Show controls when interacting with the screen
    setShowControls(true);
    e.preventDefault();
  };
  
  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (isDragging && e.touches.length === 1) {
      // Single touch - handle dragging (position)
      const touch = e.touches[0];
      
      // Calculate the delta from the start position
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      
      // Update the position
      setImageSettings(prev => ({
        ...prev,
        positionX: prev.positionX + deltaX,
        positionY: prev.positionY + deltaY
      }));
      
      // Update start position for next move
      setTouchStartX(touch.clientX);
      setTouchStartY(touch.clientY);
    } else if (isPinching && isRotating && e.touches.length === 2) {
      // Two touches - handle pinch zoom and rotation
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      
      // Handle scaling (pinch)
      const currentDistance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      const scaleFactor = currentDistance / initialDistance;
      
      // Handle rotation
      const currentAngle = Math.atan2(
        touch2.clientY - touch1.clientY,
        touch2.clientX - touch1.clientX
      ) * 180 / Math.PI;
      
      const angleDelta = currentAngle - initialAngle;
      
      // Update settings
      setImageSettings(prev => {
        const newScale = Math.max(0.1, Math.min(prev.scale * scaleFactor, 3));
        return {
          ...prev,
          scale: newScale,
          rotation: (prev.rotation + angleDelta) % 360
        };
      });
      
      // Update initial values for next move
      setInitialDistance(currentDistance);
      setInitialAngle(currentAngle);
    }
    
    // Redraw canvas
    drawCanvas();
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    setIsDragging(false);
    setIsPinching(false);
    setIsRotating(false);
  };
  
  // Mouse event handlers for desktop users
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setTouchStartX(e.clientX);
    setTouchStartY(e.clientY);
    setIsDragging(true);
    e.preventDefault();
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    // Calculate the delta from the start position
    const deltaX = e.clientX - touchStartX;
    const deltaY = e.clientY - touchStartY;
    
    // Update the position
    setImageSettings(prev => ({
      ...prev,
      positionX: prev.positionX + deltaX,
      positionY: prev.positionY + deltaY
    }));
    
    // Update start position for next move
    setTouchStartX(e.clientX);
    setTouchStartY(e.clientY);
    
    // Redraw canvas
    drawCanvas();
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // Handle mouse wheel for zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    // Zoom in/out based on wheel direction
    const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1; // Zoom out if deltaY > 0, zoom in otherwise
    
    setImageSettings(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(prev.scale * scaleFactor, 3))
    }));
    
    drawCanvas();
  };
  
  // Button handlers
  const handleExit = () => {
    // If camera is active, stop it before exiting
    if (isCameraActive) {
      stopCamera();
      setIsCameraActive(false);
    }
    endSession();
    navigate('/app');
  };
  
  const handleResetSettings = () => {
    if (overlayImageRef.current) {
      centerImageOnLoad(overlayImageRef.current);
    } else {
      setImageSettings({
        opacity: 0.5,
        scale: 1,
        rotation: 0,
        positionX: 0,
        positionY: 0
      });
    }
    drawCanvas();
  };
  
  const handleCameraSwitch = () => {
    // Toggle the camera list display
    setShowCameraList(!showCameraList);
    setShowImageSettings(false); // Close image settings if open
  };
  
  // Function to select a specific camera
  const selectCamera = async (deviceId: string) => {
    try {
      console.log('Selecting camera with ID:', deviceId);
      await startCamera(deviceId);
      console.log('Camera selected successfully');
      setIsCameraActive(true);
      setShowCameraList(false); // Hide the camera list after selection
      // Redraw canvas after camera change
      drawCanvas();
    } catch (error) {
      console.error('Error selecting camera:', error);
    }
  };
  
  // Function to toggle image settings panel
  const toggleImageSettings = () => {
    setShowImageSettings(!showImageSettings);
    setShowCameraList(false); // Close camera list if open
  };
  
  // Function to update a specific image setting
  const updateImageSetting = (setting: keyof ImageSettings, value: number) => {
    setImageSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };
  
  // Update the canvas when settings change or camera state changes
  useEffect(() => {
    drawCanvas();
    
    // Set up an animation frame loop to continuously update the canvas when camera is active
    let animationFrameId: number;
    
    const updateCanvas = () => {
      drawCanvas();
      if (isCameraActive) {
        animationFrameId = requestAnimationFrame(updateCanvas);
      }
    };
    
    if (isCameraActive) {
      animationFrameId = requestAnimationFrame(updateCanvas);
    }
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [imageSettings, isCameraActive]);
  
  // Set up our own countdown timer for non-logged in users
  useEffect(() => {
    // Only apply time limit for users who are not logged in
    if (isLoggedIn) return;
    
    // Check for 24-hour cooldown
    const lastSessionTime = localStorage.getItem('lastSessionTime');
    const now = new Date().getTime();
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    
    if (lastSessionTime) {
      const timeSinceLastSession = now - parseInt(lastSessionTime);
      const remainingCooldown = Math.max(0, cooldownPeriod - timeSinceLastSession);
      
      if (remainingCooldown > 0) {
        // Still in cooldown period
        setCooldownTime(Math.ceil(remainingCooldown / 1000));
        
        // Start cooldown countdown
        cooldownTimerRef.current = window.setInterval(() => {
          setCooldownTime(prev => {
            if (prev <= 1) {
              // Cooldown finished
              if (cooldownTimerRef.current) {
                window.clearInterval(cooldownTimerRef.current);
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        
        return;
      }
    }
    
    // Reset remaining time to 2 minutes (120 seconds) when starting a new session
    setRemainingTime(120);
    setAlertShown(false);
    setShowTimeAlert(false);
    setRedirectCountdown(20);
    
    // Start our own countdown timer
    const startTime = new Date().getTime();
    const sessionLimit = 120 * 1000; // 2 minutes in milliseconds
    
    // Clear any existing timer
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
    }
    
    // Start a new countdown timer immediately
    countdownTimerRef.current = window.setInterval(() => {
      const now = new Date().getTime();
      const elapsed = now - startTime;
      const remaining = Math.max(0, sessionLimit - elapsed);
      const remainingSecs = Math.ceil(remaining / 1000);
      
      // Update the remaining time display
      setRemainingTime(remainingSecs);
      
      // Only show alert when time is exactly up (0 seconds), and only if not already shown
      if (remainingSecs <= 0 && !alertShown && !showTimeAlert) {
        setShowTimeAlert(true);
        setAlertShown(true); // Mark alert as shown so it doesn't show again
        
        // Store the session end time for 24-hour cooldown
        localStorage.setItem('lastSessionTime', new Date().getTime().toString());
      }
      
      // When time is up
      if (remainingSecs <= 0) {
        // Clear the countdown timer
        if (countdownTimerRef.current) {
          window.clearInterval(countdownTimerRef.current);
        }
        
        // Start redirect countdown if not already started
        if (!redirectTimerRef.current) {
          redirectTimerRef.current = window.setInterval(() => {
            setRedirectCountdown(prev => {
              if (prev <= 1) {
                // Time's up, redirect to app page
                if (redirectTimerRef.current) {
                  window.clearInterval(redirectTimerRef.current);
                }
                navigate('/app');
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    }, 1000);
    
    return () => {
      // Clean up timers
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
      }
      if (redirectTimerRef.current) {
        window.clearInterval(redirectTimerRef.current);
      }
      if (cooldownTimerRef.current) {
        window.clearInterval(cooldownTimerRef.current);
      }
    };
  }, [isLoggedIn, navigate]);
  
  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      // Force start the camera with improved viewport fitting
      const initCamera = async () => {
        try {
          // Check if cameras are available
          const camerasAvailable = await getVideoDevices();
          console.log('Available cameras found:', camerasAvailable);
          
          if (camerasAvailable.length === 0) {
            // No cameras available, show alert
            alert('No camera devices detected. Please allow camera access or connect a camera.');
            console.error('No camera devices available');
            return;
          }
          
          // Find the back camera if available, otherwise use the first camera
          let preferredCamera = camerasAvailable[0].deviceId; // Default to first camera
          
          // Try to find a back-facing camera
          const backCamera = camerasAvailable.find(camera => 
            camera.label?.toLowerCase().includes('back') || 
            camera.label?.toLowerCase().includes('rear')
          );
          
          if (backCamera) {
            preferredCamera = backCamera.deviceId;
            console.log('Using back camera:', backCamera.label);
          } else {
            console.log('No back camera found, using:', camerasAvailable[0].label || 'Default camera');
          }
          
          // Start camera with the selected camera
          await startCamera(preferredCamera);
          setIsCameraActive(true);
          
          // Apply styles to ensure video fills container properly
          if (cameraVideoRef.current) {
            cameraVideoRef.current.style.width = '100%';
            cameraVideoRef.current.style.height = '100%';
            cameraVideoRef.current.style.objectFit = 'cover';
            cameraVideoRef.current.style.objectPosition = 'center';
          }
        } catch (error) {
          console.error('Failed to initialize camera:', error);
          alert('Failed to access camera. Please check your camera permissions and try again.');
        }
      };
      initCamera();
      
      // Redraw canvas when window is resized
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        drawCanvas();
      }
      
      // Also update camera view to fill screen properly
      if (cameraVideoRef.current) {
        cameraVideoRef.current.style.width = '100%';
        cameraVideoRef.current.style.height = '100%';
        cameraVideoRef.current.style.objectFit = 'cover';
        cameraVideoRef.current.style.objectPosition = 'center';
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Auto-hide controls after a period of inactivity
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowControls(false);
    }, 3000);
    
    return () => {
      clearTimeout(timer);
    };
  }, [showControls]);
  
  return (
    <div className="h-screen w-screen relative bg-gray-900 overflow-hidden touch-none">
      {/* Cooldown Screen - Show when in 24-hour cooldown */}
      {!isLoggedIn && cooldownTime > 0 && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-90">
          <div className="bg-gray-900 text-white rounded-xl p-8 max-w-md mx-4 z-10 relative shadow-2xl border border-gray-700">
            <div className="flex items-center mb-6">
              <svg className="w-10 h-10 text-amber-500 mr-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-2xl font-bold text-white">Session Cooldown</h3>
            </div>
            
            <div className="mb-6 p-4 bg-amber-900/30 border border-amber-500/30 rounded-lg">
              <p className="text-amber-400 font-medium text-center mb-3">
                ⏰ 24-Hour Cooldown Active
              </p>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-300 mb-2">
                  {Math.floor(cooldownTime / 3600)}:{(Math.floor(cooldownTime / 60) % 60).toString().padStart(2, '0')}:{(cooldownTime % 60).toString().padStart(2, '0')}
                </div>
                <p className="text-amber-300 text-sm">
                  Until your next free session
                </p>
              </div>
            </div>
            
            <p className="mb-6 text-gray-300 text-center">
              You've used your free session for today. Free users get 3 sessions per day with a 24-hour cooldown between sessions.
            </p>
            
            <div className="flex flex-col space-y-3">
              <button 
                onClick={() => navigate('/payment')}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-500 hover:to-purple-500 transition-colors duration-200 font-medium"
              >
                🚀 Upgrade to Premium - No Limits!
              </button>
              <button 
                onClick={() => navigate('/app')}
                className="w-full bg-gray-700 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors duration-200"
              >
                Back to App
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera video - Main camera view */}
      {isCameraActive && (
        <div className="absolute inset-0 z-0 bg-black w-full h-full">
          <video
            ref={cameraVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute w-full h-full object-cover"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              display: 'block'
            }}
          />
        </div>
      )}
      
      {/* Canvas for drawing the overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full z-10 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
      
      {/* Control buttons - always visible */}
      <div className="absolute top-4 left-4 flex flex-col space-y-3 z-30">
        {/* Back button */}
        <button
          onClick={handleExit}
          className="bg-gray-800 bg-opacity-70 text-white p-2 rounded-full hover:bg-gray-700 transition-colors"
          aria-label="Back to app"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        
        {/* Image Settings button */}
        <button
          onClick={toggleImageSettings}
          className={`relative bg-gray-800 bg-opacity-70 text-white p-2 rounded-full hover:bg-gray-700 transition-colors ${showImageSettings ? 'ring-2 ring-blue-500' : ''}`}
          aria-label="Image settings"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>
        
        {/* Camera button */}
        <button
          onClick={handleCameraSwitch}
          className={`relative bg-gray-800 bg-opacity-70 text-white p-2 rounded-full hover:bg-gray-700 transition-colors ${isCameraActive ? 'ring-2 ring-green-500' : ''}`}
          aria-label="Camera options"
          disabled={cameraLoading}
        >
          {cameraLoading ? (
            <svg className="h-6 w-6 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          {isCameraActive && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full"></span>
          )}
          {cameraError && (
            <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full"></span>
          )}
        </button>
      </div>
      
      {/* Camera selection dropdown */}
      {showCameraList && availableCameras && availableCameras.length > 0 && (
        <div className="absolute top-4 left-20 bg-gray-800 bg-opacity-90 rounded-lg p-2 z-40 max-h-60 overflow-y-auto">
          <h3 className="text-white text-sm font-medium mb-2">Select Camera</h3>
          <ul className="space-y-1">
            {availableCameras.map(camera => (
              <li key={camera.deviceId}>
                <button 
                  onClick={() => selectCamera(camera.deviceId)}
                  className="text-white hover:bg-gray-700 rounded px-2 py-1 text-sm w-full text-left"
                >
                  {camera.label || `Camera ${camera.deviceId.slice(0, 5)}...`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Image settings panel */}
      {showImageSettings && (
        <div className="absolute top-4 left-20 bg-gray-800 bg-opacity-90 rounded-lg p-3 z-40 w-64">
          <h3 className="text-white text-sm font-medium mb-2">Image Settings</h3>
          
          {/* Opacity slider */}
          <div className="mb-3">
            <label className="text-white text-xs block mb-1">Opacity: {imageSettings.opacity.toFixed(1)}</label>
            <input 
              type="range" 
              min="0.1" 
              max="1" 
              step="0.1" 
              value={imageSettings.opacity}
              onChange={(e) => updateImageSetting('opacity', parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Scale slider */}
          <div className="mb-3">
            <label className="text-white text-xs block mb-1">Scale: {imageSettings.scale.toFixed(1)}x</label>
            <input 
              type="range" 
              min="0.1" 
              max="3" 
              step="0.1" 
              value={imageSettings.scale}
              onChange={(e) => updateImageSetting('scale', parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Rotation slider */}
          <div className="mb-3">
            <label className="text-white text-xs block mb-1">Rotation: {imageSettings.rotation}°</label>
            <input 
              type="range" 
              min="0" 
              max="360" 
              step="5" 
              value={imageSettings.rotation}
              onChange={(e) => updateImageSetting('rotation', parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Position X slider */}
          <div className="mb-3">
            <label className="text-white text-xs block mb-1">Position X: {imageSettings.positionX}</label>
            <input 
              type="range" 
              min="-300" 
              max="300" 
              step="10" 
              value={imageSettings.positionX}
              onChange={(e) => updateImageSetting('positionX', parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Position Y slider */}
          <div className="mb-3">
            <label className="text-white text-xs block mb-1">Position Y: {imageSettings.positionY}</label>
            <input 
              type="range" 
              min="-300" 
              max="300" 
              step="10" 
              value={imageSettings.positionY}
              onChange={(e) => updateImageSetting('positionY', parseInt(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Reset button */}
          <button
            onClick={handleResetSettings}
            className="bg-blue-500 hover:bg-blue-600 text-white text-xs px-2 py-1 rounded w-full mt-2"
          >
            Reset to Default
          </button>
        </div>
      )}
      
      {/* Timer moved to top center with compact width */}
      {!isLoggedIn && (
        <div className="absolute top-4 left-0 right-0 text-center text-white bg-black bg-opacity-80 py-2 z-30 mx-auto max-w-fit rounded-full px-4 font-bold text-base shadow-lg border border-gray-600">
          {cooldownTime > 0 ? (
            <span className="text-amber-400">
              ⏰ Next session in: {Math.floor(cooldownTime / 3600)}:{(Math.floor(cooldownTime / 60) % 60).toString().padStart(2, '0')}:{(cooldownTime % 60).toString().padStart(2, '0')}
            </span>
          ) : (
            <span className={remainingTime <= 10 ? 'text-red-500 animate-pulse' : remainingTime <= 30 ? 'text-yellow-400' : 'text-green-400'}>
              ⏱️ {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>
      )}
      
      {/* Time limit alert - only shown for non-logged in users */}
      {showTimeAlert && !isLoggedIn && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="bg-black bg-opacity-80 absolute inset-0 backdrop-blur-sm"></div>
          <div className="bg-gray-900 text-white rounded-xl p-8 max-w-md mx-4 z-10 relative shadow-2xl border border-gray-700">
            <div className="flex items-center mb-4">
              <svg className="w-8 h-8 text-amber-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xl font-bold text-white">⏰ Session Ended</h3>
            </div>
            <p className="mb-4 text-gray-300">
              Your <span className="text-amber-400 font-bold">2-minute free session</span> has ended. You can use <span className="text-blue-400 font-bold">3 free sessions per day</span> with a 24-hour cooldown between sessions.
            </p>
            <div className="mb-6 p-4 bg-amber-900/30 border border-amber-500/30 rounded-lg">
              <p className="text-amber-400 font-medium text-center mb-2">
                🔄 24-Hour Cooldown Active
              </p>
              <p className="text-amber-300 text-sm text-center">
                Your next free session will be available in 24 hours, or upgrade to premium for unlimited access!
              </p>
            </div>
            {redirectCountdown > 0 && (
              <div className="mb-6 p-3 bg-gray-800 rounded-lg">
                <p className="text-amber-400 font-medium text-center">
                  Redirecting to app page in {redirectCountdown} seconds...
                </p>
              </div>
            )}
            <div className="flex flex-col space-y-3">
              <button 
                onClick={() => navigate('/payment')}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 px-4 rounded-lg hover:from-blue-500 hover:to-purple-500 transition-colors duration-200 font-medium"
              >
                🚀 Upgrade to Premium - Unlimited Access
              </button>
              <button 
                onClick={() => navigate('/app')}
                className="w-full bg-gray-700 text-white py-3 px-4 rounded-lg hover:bg-gray-600 transition-colors duration-200"
              >
                Back to App
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TracingPage;
