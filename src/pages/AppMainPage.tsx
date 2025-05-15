import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUsageTracking } from '../hooks/useUsageTracking';
import CameraPermissionManager from '../components/CameraPermissionManager';
import ImageUploader from '../components/ImageUploader';
import UsageStatus from '../components/UsageStatus';

const AppMainPage: React.FC = () => {
  const { user, userRole, signOut } = useAuth();
  const { hasReachedLimit, refreshUsageStats } = useUsageTracking();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<boolean | null>(null);
  // We're using window.location.href for navigation instead of navigate
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image selection from the ImageUploader component
  const handleImageSelect = (file: File | null, url: string) => {
    setSelectedImage(file);
    setPreviewUrl(url);
    setError(null);
  };

  // Handle file upload button click
  const handleUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const url = URL.createObjectURL(file);
      handleImageSelect(file, url);
      
      // Convert to base64 for more reliable storage
      const reader = new FileReader();
      reader.onloadend = () => {
        // Store the base64 version in state
        if (typeof reader.result === 'string') {
          setPreviewUrl(reader.result);
        }
      };
      reader.onerror = () => {
        console.error('Error converting image to base64');
      };
      reader.readAsDataURL(file);
    }
  };

  // Resize image to a reasonable size for storage
  const resizeImage = async (imageData: string, maxWidth = 1024, maxHeight = 1024): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        console.log('Resizing image to max dimensions:', maxWidth, 'x', maxHeight);
        
        // Create an image element to load the data
        const img = new Image();
        img.onload = () => {
          // Calculate new dimensions while maintaining aspect ratio
          let width = img.width;
          let height = img.height;
          
          console.log('Original image dimensions:', width, 'x', height);
          
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
            console.log('Resized dimensions:', width, 'x', height);
          } else {
            console.log('Image already within size limits, no resize needed');
          }
          
          // Create a canvas to draw the resized image
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          // Draw the image on the canvas
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          ctx.drawImage(img, 0, 0, width, height);
          
          // Get the data URL from the canvas (with some compression)
          const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          console.log('Resized image data length:', resizedDataUrl.length);
          
          resolve(resizedDataUrl);
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image for resizing'));
        };
        
        // Load the image
        img.src = imageData;
      } catch (error) {
        console.error('Error in resizeImage:', error);
        reject(error);
      }
    });
  };

  // Convert blob URL to base64 data URL
  const convertBlobToBase64 = async (blobUrl: string): Promise<string> => {
    try {
      console.log('Starting blob to base64 conversion for URL:', blobUrl);
      
      // Fetch the blob
      const response = await fetch(blobUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log('Blob fetched successfully, size:', blob.size, 'bytes, type:', blob.type);
      
      // Convert blob to base64
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          console.log('Base64 conversion complete, length:', base64data?.length || 0);
          resolve(base64data);
        };
        reader.onerror = (event) => {
          console.error('FileReader error during base64 conversion:', event);
          reject(new Error('FileReader error during base64 conversion'));
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting blob to base64:', error);
      throw error;
    }
  };

  // Validate image format and type
  const validateImage = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      // Check file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
      if (!validTypes.includes(file.type)) {
        console.error('Invalid file type:', file.type);
        setError(`Invalid file format. Please upload a JPEG, PNG, GIF, WebP, or BMP image.`);
        resolve(false);
        return;
      }
      
      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      if (file.size > maxSize) {
        console.error('File too large:', file.size, 'bytes');
        setError(`Image is too large (${(file.size / (1024 * 1024)).toFixed(2)}MB). Maximum size is 10MB.`);
        resolve(false);
        return;
      }
      
      // Check if image loads correctly
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        // Check dimensions
        if (img.width < 10 || img.height < 10) {
          console.error('Image dimensions too small:', img.width, 'x', img.height);
          setError('Image dimensions are too small. Please upload a larger image.');
          resolve(false);
          return;
        }
        if (img.width > 5000 || img.height > 5000) {
          console.error('Image dimensions too large:', img.width, 'x', img.height);
          setError('Image dimensions are too large. Please upload a smaller image or resize it.');
          resolve(false);
          return;
        }
        resolve(true);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        console.error('Failed to load image');
        setError('Failed to load image. The file might be corrupted.');
        resolve(false);
      };
      
      img.src = objectUrl;
    });
  };
  
  // Handle start tracing button click
  const handleStartTracing = async () => {
    console.log('Start tracing clicked');
    
    if (!selectedImage) {
      console.error('No image selected');
      setError('Please upload an image before starting.');
      return;
    }
    
    console.log('Selected image:', selectedImage.name, 'Size:', selectedImage.size, 'bytes');
    console.log('Preview URL exists:', !!previewUrl);
    console.log('User role:', userRole, 'User signed in:', !!user);
    
    // Validate the image first
    const isValid = await validateImage(selectedImage);
    if (!isValid) {
      return; // Error message already set by validateImage
    }
    
    // Only apply session limits to non-signed-in users
    if (!user && userRole === 'free' && hasReachedLimit) {
      setError('You have reached your daily session limit. Please sign in to continue.');
      return;
    }
    
    // Set loading state
    setIsLoading(true);

    try {
      // Check if we have a valid preview URL
      if (!previewUrl) {
        throw new Error('No image preview available');
      }
      
      console.log('Preparing image for tracing...');
      
      // Process the image based on its format
      let base64Data = previewUrl;
      
      // If the preview is already a base64 data URL (from ImageUploader), use it directly
      if (previewUrl.startsWith('data:image/')) {
        console.log('Using existing base64 data URL');
        // No conversion needed, it's already in the right format
      } 
      // If it's a blob URL, convert it to base64
      else if (previewUrl.startsWith('blob:')) {
        console.log('Converting blob URL to base64...');
        try {
          base64Data = await convertBlobToBase64(previewUrl);
          console.log('Blob conversion successful');
        } catch (conversionError) {
          console.error('Failed to convert blob to base64:', conversionError);
          // Try to use the original file as a fallback
          if (selectedImage) {
            console.log('Attempting fallback conversion from original file...');
            base64Data = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(selectedImage);
            });
            console.log('Fallback conversion successful');
          } else {
            throw new Error('Image conversion failed and no fallback available');
          }
        }
      } else {
        console.warn('Unknown image format, URL format not recognized:', 
          previewUrl.substring(0, 20) + '...');
      }
      
      // Validate the base64 data
      if (!base64Data || typeof base64Data !== 'string' || !base64Data.startsWith('data:image/')) {
        throw new Error('Invalid image data format');
      }
      
      // Resize the image to a reasonable size before storing
      try {
        console.log('Resizing image before storage...');
        base64Data = await resizeImage(base64Data);
        console.log('Image resized successfully');
      } catch (resizeError) {
        console.error('Error resizing image:', resizeError);
        // Continue with original image if resize fails
        console.log('Continuing with original image');
      }
      
      // Clear any existing image data first
      sessionStorage.removeItem('traceImageUrl');
      sessionStorage.removeItem('traceImageData');
      localStorage.removeItem('traceImageUrl');
      localStorage.removeItem('traceImageData');
      
      // Store the image data in both sessionStorage and localStorage for redundancy
      try {
        // Store in sessionStorage (primary)
        sessionStorage.setItem('traceImageUrl', previewUrl);
        sessionStorage.setItem('traceImageData', base64Data);
        
        // Also store in localStorage (backup)
        localStorage.setItem('traceImageUrl', previewUrl);
        localStorage.setItem('traceImageData', base64Data);
        
        // Verify data was stored correctly
        const storedUrl = sessionStorage.getItem('traceImageUrl') || localStorage.getItem('traceImageUrl');
        const storedData = sessionStorage.getItem('traceImageData') || localStorage.getItem('traceImageData');
        
        console.log('Image data stored in browser storage:', {
          urlStored: !!storedUrl,
          dataStored: !!storedData,
          dataLength: storedData?.length || 0
        });
        
        if (!storedUrl || !storedData) {
          throw new Error('Failed to store image data in browser storage');
        }
        
        // Navigate to tracing page after successful storage
        console.log('Storage confirmed, navigating to tracing page now...');
        console.log('Navigation path: /trace');
        
        // Force a direct navigation to the trace page
        window.location.href = '/trace';
      } catch (storageError) {
        console.error('Storage error:', storageError);
        throw new Error('Failed to store image in browser storage. The image may be too large.');
      }
    } catch (error) {
      console.error('Error preparing image for tracing:', error);
      setIsLoading(false);
      setError('There was an error preparing your image. Please try uploading it again.');
    }
  };

  // Refresh usage stats when component mounts
  useEffect(() => {
    refreshUsageStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Handle camera permission change
  const handleCameraPermissionChange = (granted: boolean) => {
    setCameraPermissionStatus(granted);
    console.log('Camera permission status:', granted ? 'granted' : 'denied');
  };

  // Clean up preview URL when component unmounts
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 text-white font-sans relative overflow-hidden">
      {/* Background gradient circles */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/20 blur-[100px]"></div>
        <div className="absolute top-[50%] -right-[5%] w-[30%] h-[30%] rounded-full bg-orange-500/20 blur-[100px]"></div>
      </div>
      
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 w-full z-50 bg-dark-500/80 backdrop-blur-md border-b border-primary-500/20">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <img src="/assests/logo/logo-dark-bg.png" alt="TraceMate Logo" className="h-10 mr-3" />
            </div>
            
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <div className="text-sm px-3 py-1 rounded-full bg-primary-500/20 border border-primary-500/30 text-primary-300">
                    Premium Plan
                  </div>
                  <button
                    onClick={signOut}
                    className="text-white hover:text-red-300 transition-colors font-medium flex items-center gap-1"
                  >
                    <span>Sign Out</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </>
              ) : (
                <Link 
                  to="/signin" 
                  className="text-white hover:text-primary-100 transition-colors font-medium"
                >
                  Sign In
                </Link>
              )}
              
              <Link to="/" className="text-white hover:text-primary-100 transition-colors font-medium">
                Home
              </Link>
              
              {/* Only show Pricing link if user is not signed in */}
              {!user && (
                <Link to="/payment" className="text-white hover:text-primary-100 transition-colors font-medium">
                  Pricing
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content with padding for the fixed header */}
      <div className="pt-24 pb-16 px-4 container mx-auto max-w-6xl relative z-10">
        {/* Camera Permission Manager - invisible component that handles permission requests */}
        <CameraPermissionManager onPermissionChange={handleCameraPermissionChange} />
        {cameraPermissionStatus === false && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-6 p-4 bg-yellow-900/40 border border-yellow-500/50 text-yellow-200 rounded-lg backdrop-blur-sm"
          >
            <div className="flex items-start gap-3">
              <svg className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>
                <strong>Camera access denied.</strong> You'll need camera access for the tracing feature. 
                You can change this in your browser settings if you want to use the camera later.
              </span>
            </div>
          </motion.div>
        )}
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">TraceMate App</span>
          </h1>
          <p className="text-xl text-blue-100/80 max-w-2xl mx-auto">
            Upload an image for one-time tracing session
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="max-w-2xl mx-auto bg-dark-400/30 border border-primary-500/20 rounded-xl backdrop-blur-sm overflow-hidden shadow-lg"
        >
          <div className="p-8">
            {error && (
              <div id="error-message" className="mb-6 p-4 bg-red-900/40 border border-red-500/50 text-red-200 rounded-lg backdrop-blur-sm animate-pulse">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div className="mb-8">
              <ImageUploader
                onImageSelect={handleImageSelect}
                selectedImage={selectedImage}
                previewUrl={previewUrl}
              />
            </div>

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            
            {/* Upload button */}
            <div className="mb-4">
              <button
                onClick={handleUploadClick}
                className="w-full py-3 px-6 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2"
              >
                Upload Image
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                </svg>
              </button>
            </div>
            
            {/* Start tracing button */}
            <div className="mb-8">
              <button
                onClick={handleStartTracing}
                disabled={!selectedImage || isLoading}
                className={`w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg ${
                  !selectedImage || isLoading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? 'Loading...' : 'Start Tracing'}
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>

            <div className="bg-dark-500/30 backdrop-blur-sm border border-primary-500/20 rounded-lg p-4">
              <UsageStatus />
            </div>
            
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-0">
              {!user && (
                <Link 
                  to="/signin" 
                  className="px-5 py-2 bg-dark-500/50 hover:bg-dark-400/50 border border-primary-500/30 text-white font-medium rounded-lg transition-colors duration-300 flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <span>Sign In</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                </Link>
              )}
              
              {!user && userRole === 'free' && (
                <div className="hidden sm:flex items-center px-4">
                  <div className="h-8 w-px bg-primary-500/20"></div>
                </div>
              )}
              
              {/* Upgrade button removed */}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="bg-dark-500/30 backdrop-blur-md border-t border-primary-500/10 py-8 relative z-10">
        <div className="container mx-auto px-4 text-center">
          <p className="text-blue-100/50 text-sm">
            © {new Date().getFullYear()} TraceMate. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AppMainPage;
