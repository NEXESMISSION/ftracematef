// Camera utility functions for TraceMate

// Get available cameras/video devices
export const getVideoDevices = async (): Promise<MediaDeviceInfo[]> => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  } catch (error) {
    console.error('Error getting video devices:', error);
    return [];
  }
};

// Request camera access with specified constraints
export const requestCameraAccess = async (
  facingMode: 'user' | 'environment' = 'environment',
  deviceId?: string
): Promise<MediaStream | null> => {
  try {
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode }
    };
    
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    console.error('Error accessing camera:', error);
    return null;
  }
};

// Stop all tracks in a media stream
export const stopMediaStream = (stream: MediaStream | null): void => {
  if (!stream) return;
  
  stream.getTracks().forEach(track => {
    track.stop();
  });
};

// Check if the browser supports the required camera APIs
export const checkCameraSupport = (): boolean => {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    navigator.mediaDevices.enumerateDevices
  );
};
