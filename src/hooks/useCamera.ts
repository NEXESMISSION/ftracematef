import { useState, useEffect, useRef } from 'react';
import { requestCameraAccess, stopMediaStream, getVideoDevices } from '../utils/camera';

interface UseCameraProps {
  autoStart?: boolean;
  initialFacingMode?: 'user' | 'environment';
}

interface UseCameraReturn {
  stream: MediaStream | null;
  // Using MutableRefObject to avoid TypeScript errors
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  isLoading: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  currentDeviceId: string | null;
  facingMode: 'user' | 'environment';
  isMockCamera: boolean;
  startCamera: (deviceId?: string) => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
  enableMockCamera: () => void;
}

export const useCamera = ({
  autoStart = true,
  initialFacingMode = 'environment'
}: UseCameraProps = {}): UseCameraReturn => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(initialFacingMode);
  const [isMockCamera, setIsMockCamera] = useState<boolean>(false);
  // Using HTMLVideoElement instead of HTMLVideoElement | null to match the interface
  const videoRef = useRef<HTMLVideoElement>(null);
  const mockCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch available video devices
  const fetchDevices = async () => {
    try {
      const videoDevices = await getVideoDevices();
      setDevices(videoDevices);
    } catch (err) {
      console.error('Error fetching video devices:', err);
      setError('Failed to get camera devices');
    }
  };

  // Start camera with given device ID or facing mode
  const startCamera = async (deviceId?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Check if camera is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera is not supported in this browser');
      }

      // Stop any existing stream
      if (stream) {
        stopCamera();
      }
      
      // Request camera access
      const newStream = await requestCameraAccess(
        deviceId ? undefined : facingMode,
        deviceId
      );
      
      if (!newStream) {
        throw new Error('Failed to access camera. Please check camera permissions in your browser settings.');
      }
      
      setStream(newStream);
      setCurrentDeviceId(deviceId || null);
      
      // Connect stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        
        // Ensure the video plays when it's loaded
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => {
              console.error('Error playing video:', e);
              setError('Error displaying camera feed. Please reload the page.');
            });
          }
        };
      }
      
      // Refresh device list
      await fetchDevices();
    } catch (err: any) {
      console.error('Error starting camera:', err);
      
      // Provide more specific error messages based on error type
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setError('No camera found. Please connect a camera and try again.');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera access denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setError('Camera is in use by another application. Please close other applications using the camera.');
      } else {
        setError(err.message || 'Failed to access camera');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Stop the camera stream
  const stopCamera = () => {
    stopMediaStream(stream);
    setStream(null);
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  // Create a mock camera stream using a canvas
  const enableMockCamera = () => {
    // Stop any existing stream
    if (stream) {
      stopCamera();
    }
    
    setError(null);
    setIsLoading(true);
    
    try {
      // Create a canvas element for the mock video
      if (!mockCanvasRef.current) {
        mockCanvasRef.current = document.createElement('canvas');
      }
      
      const canvas = mockCanvasRef.current;
      canvas.width = 640;
      canvas.height = 480;
      
      // Get the canvas context and draw a placeholder
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill with a dark background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add some text
        ctx.fillStyle = '#fff';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Camera not available', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillText('Using mock camera mode', canvas.width / 2, canvas.height / 2 + 20);
        
        // Create a mock stream from the canvas
        const mockStream = canvas.captureStream(30); // 30 FPS
        setStream(mockStream);
        
        // Connect to video element
        if (videoRef.current) {
          videoRef.current.srcObject = mockStream;
          videoRef.current.play().catch(e => {
            console.error('Error playing mock video:', e);
          });
        }
        
        setIsMockCamera(true);
      }
    } catch (err) {
      console.error('Error creating mock camera:', err);
      setError('Failed to create mock camera mode');
    } finally {
      setIsLoading(false);
    }
  };

  // Switch between front and back cameras
  const switchCamera = async () => {
    // If in mock camera mode, do nothing
    if (isMockCamera) return;
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    // Find a device matching the new facing mode if possible
    const targetDevice = devices.find(device => 
      device.label.toLowerCase().includes(
        newFacingMode === 'user' ? 'front' : 'back'
      )
    );
    
    await startCamera(targetDevice?.deviceId);
  };

  // Initialize camera on mount if autoStart is true
  useEffect(() => {
    if (autoStart) {
      startCamera().catch(err => {
        console.error('Error starting camera on mount:', err);
        // Don't automatically switch to mock mode on initial load
        // Let the user decide if they want to continue without camera
      });
    }
    
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    stream,
    videoRef,
    isLoading,
    error,
    devices,
    currentDeviceId,
    facingMode,
    isMockCamera,
    startCamera,
    stopCamera,
    switchCamera,
    enableMockCamera
  };
};
