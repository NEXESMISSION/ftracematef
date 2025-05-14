import React, { useEffect, useState } from 'react';

interface CameraPermissionManagerProps {
  onPermissionChange?: (granted: boolean) => void;
}

/**
 * Component that handles camera permission requests
 * It will request camera permission once and remember the user's choice
 */
const CameraPermissionManager: React.FC<CameraPermissionManagerProps> = ({ 
  onPermissionChange 
}) => {
  // We track permission status internally but only expose granted/denied to parent
  const [, setPermissionStatus] = useState<string | null>(null);

  useEffect(() => {
    // Check if we've already requested camera permission
    const storedPermission = localStorage.getItem('camera_permission');
    
    if (storedPermission) {
      try {
        const { status } = JSON.parse(storedPermission);
        setPermissionStatus(status);
        onPermissionChange?.(status === 'granted');
        return;
      } catch (e) {
        console.error('Error parsing stored camera permission:', e);
      }
    }

    // If no stored permission, request it
    const requestPermission = async () => {
      try {
        // Try to access the camera to request permission
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        
        // Store the permission status
        const permissionData = {
          status: 'granted',
          timestamp: Date.now()
        };
        localStorage.setItem('camera_permission', JSON.stringify(permissionData));
        
        setPermissionStatus('granted');
        onPermissionChange?.(true);
      } catch (error) {
        console.error('Error requesting camera permission:', error);
        
        // Store the denied permission
        if (error instanceof DOMException && 
            (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
          const permissionData = {
            status: 'denied',
            timestamp: Date.now()
          };
          localStorage.setItem('camera_permission', JSON.stringify(permissionData));
          
          setPermissionStatus('denied');
          onPermissionChange?.(false);
        }
      }
    };
    
    requestPermission();
  }, [onPermissionChange]);

  // This component doesn't render anything visible
  return null;
};

export default CameraPermissionManager;
