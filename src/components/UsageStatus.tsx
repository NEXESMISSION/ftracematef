import React from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { USAGE_LIMITS } from '../utils/usageLimits';

interface UsageStatusProps {
  className?: string;
}

const UsageStatus: React.FC<UsageStatusProps> = ({
  className = '',
}) => {
  const { user, userRole } = useAuth();
  const { usageStats, hasReachedLimit } = useUsageTracking();

  return (
    <div className={className}>
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center text-sm"
      >
        {user ? (
          // Signed in users
          userRole === 'paid' ? (
            // Paid users
            <>
              <div className="text-gray-700 dark:text-gray-300 mb-2">
                <span className="font-semibold text-green-600">Premium User</span> - Unlimited sessions
              </div>
              <div className="text-gray-600 dark:text-gray-400 mb-4">
                Unlimited time per session
              </div>
              <div className="text-green-600 dark:text-green-400">Happy tracing 🎉</div>
            </>
          ) : (
            // Free users (signed in but no subscription)
            <>
              <div className="text-gray-700 dark:text-gray-300 mb-2">
                <span className="font-semibold text-yellow-600">Free Plan</span> - Limited access
              </div>
              <div className="text-gray-600 dark:text-gray-400 mb-4">
                {usageStats.sessions} / {USAGE_LIMITS.free.sessionsPerDay} sessions used today
                {hasReachedLimit && (
                  <span className="text-red-500 ml-2">(Limit reached)</span>
                )}
              </div>
              <div className="text-yellow-600 dark:text-yellow-400 mb-2">
                {USAGE_LIMITS.free.sessionDurationSecs / 60} minutes per session
              </div>
              <div className="text-blue-500 mb-2">
                Upgrade for unlimited access
              </div>
            </>
          )
        ) : (
          // Non-signed in users
          <>
            <div className="text-gray-700 dark:text-gray-300 mb-2">
              {usageStats.sessions} / {USAGE_LIMITS.free.sessionsPerDay} sessions used today
              {hasReachedLimit && (
                <span className="text-red-500 ml-2">(Limit reached)</span>
              )}
            </div>
            <div className="text-gray-600 dark:text-gray-400 mb-4">
              {USAGE_LIMITS.free.sessionDurationSecs / 60} minutes per session
            </div>
            <div className="text-blue-500 mb-2">
              Sign in for unlimited access
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default UsageStatus;
