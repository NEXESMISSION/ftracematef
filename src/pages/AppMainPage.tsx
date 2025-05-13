import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUsageTracking } from '../hooks/useUsageTracking';
import ImageUploader from '../components/ImageUploader';
import UsageStatus from '../components/UsageStatus';

const AppMainPage: React.FC = () => {
  const { user, userRole } = useAuth();
  const { usageStats, hasReachedLimit, refreshUsageStats } = useUsageTracking();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Handle image selection from the ImageUploader component
  const handleImageSelect = (file: File | null, url: string) => {
    setSelectedImage(file);
    setPreviewUrl(url ? url : null);
    setError(null);
  };

  // Handle start tracing button click
  const handleStartTracing = () => {
    if (!selectedImage) {
      setError('Please select an image first');
      return;
    }

    if (userRole === 'free' && hasReachedLimit) {
      setError('You have reached your daily session limit. Please upgrade to continue.');
      return;
    }

    // Store the selected image in sessionStorage (as URL)
    if (previewUrl) {
      sessionStorage.setItem('traceImageUrl', previewUrl);
      navigate('/trace');
    }
  };

  // Refresh usage stats when component mounts
  React.useEffect(() => {
    refreshUsageStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clean up preview URL when component unmounts
  React.useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-indigo-950">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">TraceMate</h1>
          {user ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {userRole === 'paid' ? 'Unlimited Plan' : 'Free Plan'}
            </div>
          ) : (
            <Link 
              to="/signin" 
              className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Sign In
            </Link>
          )}
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-md mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden"
        >
          <div className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Upload an Image to Trace
              </h2>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Select an image to overlay on your camera feed
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {error}
              </div>
            )}

            <div className="mb-6">
              <ImageUploader
                onImageSelect={handleImageSelect}
                selectedImage={selectedImage}
                previewUrl={previewUrl}
              />
            </div>

            <div className="mb-6">
              <button
                onClick={handleStartTracing}
                disabled={!selectedImage || isLoading}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                  !selectedImage || isLoading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? 'Loading...' : 'Start Tracing'}
              </button>
            </div>

            <UsageStatus
              userRole={userRole}
              usageStats={usageStats}
              hasReachedLimit={hasReachedLimit}
            />
          </div>
        </motion.div>

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AppMainPage;
