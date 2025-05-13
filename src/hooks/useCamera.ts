import { useState, useEffect, useRef } from 'react';
import { requestCameraAccess, stopMediaStream, getVideoDevices } from '../utils/camera';

interface UseCameraProps {
  autoStart?: boolean;
  initialFacingMode?: 'user' | 'environment';
}

interface UseCameraReturn {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement>;
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
        throw new Error('Failed to access camera');
      }
      
      setStream(newStream);
      setCurrentDeviceId(deviceId || null);
      
      // Connect stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
      
      // Refresh device list
      await fetchDevices();
    } catch (err: any) {
      console.error('Error starting camera:', err);
      setError(err.message || 'Failed to access camera');
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
