import { useState, useEffect, useRef } from 'react';
import { requestCameraAccess, stopMediaStream, getVideoDevices } from '../utils/camera';

interface UseCameraProps {
  autoStart?: boolean;
  initialFacingMode?: 'user' | 'environment';
}

interface UseCameraReturn {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isLoading: boolean;
  error: string | null;
  devices: MediaDeviceInfo[];
  currentDeviceId: string | null;
  facingMode: 'user' | 'environment';
  startCamera: (deviceId?: string) => Promise<void>;
  stopCamera: () => void;
  switchCamera: () => Promise<void>;
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
  const videoRef = useRef<HTMLVideoElement>(null);

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

  // Switch between front and back cameras
  const switchCamera = async () => {
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
      startCamera();
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
    startCamera,
    stopCamera,
    switchCamera
  };
};
