import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface ImageUploaderProps {
  onImageSelect: (file: File, previewUrl: string) => void;
  previewUrl: string | null;
  selectedImage?: File | null; // Made optional since it's not used internally
  className?: string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageSelect,
  previewUrl,
  className = '',
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection from input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    validateAndProcessFile(file);
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files?.length) {
      const file = e.dataTransfer.files[0];
      validateAndProcessFile(file);
    }
  };

  // Validate and process the selected file
  const validateAndProcessFile = (file: File) => {
    // Reset error
    setError(null);
    
    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }
    
    // Convert file to base64 data URL instead of blob URL
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        // Pass the base64 data URL to parent
        onImageSelect(file, reader.result);
      }
    };
    reader.onerror = () => {
      setError('Error reading the image file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  // Handle click on the upload area
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Handle removing the selected image
  const handleRemoveImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Revoke object URL to prevent memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Pass null to parent
    onImageSelect(null as any, '');
  };

  return (
    <div className={className}>
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      <div 
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragging ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-400' :
          previewUrl ? 'border-indigo-300' : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
        onClick={handleUploadClick}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleFileChange}
        />

        {previewUrl ? (
          <div className="relative">
            <motion.img 
              src={previewUrl} 
              alt="Preview" 
              className="max-h-64 mx-auto rounded"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            />
            <button 
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              onClick={handleRemoveImage}
              aria-label="Remove image"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth="2" 
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" 
              />
            </svg>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {isDragging ? 'Drop image here' : 'Click to select an image or drag and drop'}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              PNG, JPG, GIF up to 5MB
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default ImageUploader;
