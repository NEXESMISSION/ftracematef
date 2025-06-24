import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { motion } from 'framer-motion';

interface PaymentGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const PaymentGate: React.FC<PaymentGateProps> = ({ children, fallback }) => {
  const { user, userRole, isLoading } = useAuth();
  const { hasReachedLimit } = useUsageTracking();
  const navigate = useNavigate();
  const [showLimitReached, setShowLimitReached] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      // Check if user has reached their daily limit
      if (hasReachedLimit) {
        setShowLimitReached(true);
      } else {
        setShowLimitReached(false);
      }
    }
  }, [isLoading, hasReachedLimit]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  if (showLimitReached) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-dark-400 to-dark-600 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-dark-400/30 border border-primary-500/20 rounded-xl backdrop-blur-sm p-8 text-center"
        >
          <div className="mb-6">
            <svg className="w-16 h-16 text-primary-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-2xl font-bold text-white mb-2">Daily Limit Reached</h2>
            <p className="text-gray-300 mb-6">
              You've used all 3 free sessions for today. Upgrade to premium for unlimited access!
            </p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => navigate('/payment')}
              className="w-full py-3 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              <span>Get Unlimited Access</span>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
            
            <button
              onClick={() => navigate('/')}
              className="w-full py-2 px-4 text-gray-400 hover:text-white transition-colors"
            >
              Back to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
};

export default PaymentGate; 