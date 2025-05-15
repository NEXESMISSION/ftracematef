// Permissions utility for managing browser permissions

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

// Type definitions
type PermissionState = 'granted' | 'denied' | 'prompt';

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
  // If not in browser environment, return false
  if (!isBrowser) return false;
  
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
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'camera' as any });
        
        // Store the permission status
        storeCameraPermission(permission.state);
        
        return permission.state === 'granted';
      } catch (err) {
        console.warn('Permission API error:', err);
        // Continue to fallback method
      }
    }
    
    // Fallback: Try to access the camera to check permission
    if (typeof navigator !== 'undefined' && 'mediaDevices' in navigator && navigator.mediaDevices) {
      try {
        const stream = await (navigator.mediaDevices as MediaDevices).getUserMedia({ video: true });
        // Stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        
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
    }
    
    return false;
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
  // If not in browser environment, return false
  if (!isBrowser) return false;
  
  try {
    // First check if we already have permission
    const hasPermission = await checkCameraPermission();
    if (hasPermission) {
      return true;
    }
    
    // If not, request permission by trying to access the camera
    if (typeof navigator !== 'undefined' && 'mediaDevices' in navigator && navigator.mediaDevices) {
      try {
        const stream = await (navigator.mediaDevices as MediaDevices).getUserMedia({ video: true });
        // Stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        
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
    }
    
    return false;
  } catch (error) {
    console.error('Error requesting camera permission:', error);
    return false;
  }
};

/**
 * Store camera permission status in localStorage
 * @param status PermissionState
 */
export const storeCameraPermission = (status: PermissionState): void => {
  try {
    // Check if we're in a browser environment
    if (!isBrowser) return;
    
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
    // Check if we're in a browser environment
    if (!isBrowser) return null;
    
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
    // Check if we're in a browser environment
    if (!isBrowser) return;
    
    localStorage.removeItem('camera_permission');
  } catch (error) {
    console.error('Error clearing camera permission:', error);
  }
};
