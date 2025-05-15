// Permissions utility for managing browser permissions

// Ensure TypeScript recognizes the navigator object properly
declare const navigator: Navigator & {
  permissions?: {
    query: (permissionDesc: { name: string }) => Promise<{ state: PermissionState }>;
  };
  mediaDevices?: MediaDevices;
};

/**
 * Permission status stored in localStorage
 */
interface StoredPermission {
  status: PermissionState;
  timestamp: number;
}

/**
 * Check if camera permission has been granted
 * @returns Promise<boolean> True if permission is granted
 */
export const checkCameraPermission = async (): Promise<boolean> => {
  try {
    // First check if we have a stored permission status
    const storedPermission = getCameraPermissionFromStorage();
    
    // If we have a recent stored permission that's granted, use that
    if (storedPermission && 
        storedPermission.status === 'granted' && 
        isPermissionRecent(storedPermission.timestamp)) {
      return true;
    }
    
    // If the Permission API is available, use it
    if ('permissions' in navigator) {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      
      // Store the permission status
      storeCameraPermission(permission.state);
      
      return permission.state === 'granted';
    }
    
    // Fallback: Try to access the camera to check permission
    try {
      // Use a safer way to check for mediaDevices
      if (!navigator.mediaDevices) {
        throw new Error('MediaDevices API not supported');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop the stream immediately
      stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      
      // Store the granted permission
      storeCameraPermission('granted');
      return true;
    } catch (error) {
      // If we get a permission error, store it
      if (error instanceof DOMException && 
          (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        storeCameraPermission('denied');
      }
      return false;
    }
  } catch (error) {
    console.error('Error checking camera permission:', error);
    return false;
  }
};

/**
 * Request camera permission if not already granted
 * @returns Promise<boolean> True if permission is granted
 */
export const requestCameraPermission = async (): Promise<boolean> => {
  try {
    // First check if we already have permission
    const hasPermission = await checkCameraPermission();
    if (hasPermission) {
      return true;
    }
    
    // If not, request permission by trying to access the camera
    if (!navigator.mediaDevices) {
      throw new Error('MediaDevices API not supported');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Stop the stream immediately
    stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    
    // Store the granted permission
    storeCameraPermission('granted');
    return true;
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    
    // If we get a permission error, store it
    if (error instanceof DOMException && 
        (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
      storeCameraPermission('denied');
    }
    
    return false;
  }
};

/**
 * Store camera permission status in localStorage
 * @param status PermissionState
 */
export const storeCameraPermission = (status: PermissionState): void => {
  try {
    const permission: StoredPermission = {
      status,
      timestamp: Date.now()
    };
    localStorage.setItem('camera_permission', JSON.stringify(permission));
  } catch (error) {
    console.error('Error storing camera permission:', error);
  }
};

/**
 * Get camera permission status from localStorage
 * @returns StoredPermission | null
 */
export const getCameraPermissionFromStorage = (): StoredPermission | null => {
  try {
    const storedPermission = localStorage.getItem('camera_permission');
    if (storedPermission) {
      return JSON.parse(storedPermission) as StoredPermission;
    }
    return null;
  } catch (error) {
    console.error('Error getting camera permission from storage:', error);
    return null;
  }
};

/**
 * Check if a permission timestamp is recent (within 24 hours)
 * @param timestamp number
 * @returns boolean
 */
export const isPermissionRecent = (timestamp: number): boolean => {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return Date.now() - timestamp < ONE_DAY_MS;
};

/**
 * Clear stored camera permission
 */
export const clearCameraPermission = (): void => {
  try {
    localStorage.removeItem('camera_permission');
  } catch (error) {
    console.error('Error clearing camera permission:', error);
  }
};
