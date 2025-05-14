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
      setError('Please upload an image before starting. Click the upload area above to select an image from your device.');
      
      // Create a visual indication by scrolling to the error message
      setTimeout(() => {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
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
                <div className="text-sm px-3 py-1 rounded-full bg-primary-500/20 border border-primary-500/30 text-primary-300">
                  {userRole === 'paid' ? 'Unlimited Plan' : 'Free Plan'}
                </div>
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
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content with padding for the fixed header */}
      <div className="pt-24 pb-16 px-4 container mx-auto max-w-6xl relative z-10">
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
              <UsageStatus
                userRole={userRole}
                usageStats={usageStats}
                hasReachedLimit={hasReachedLimit}
              />
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
              
              {userRole === 'free' && (
                <Link 
                  to="/payment" 
                  className="px-5 py-2 bg-gradient-to-r from-blue-600/80 to-purple-600/80 hover:from-blue-600 hover:to-purple-600 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 w-full sm:w-auto"
                >
                  <span>Upgrade to Unlimited</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
              )}
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
