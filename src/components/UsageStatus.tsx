import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UsageStats } from '../types';
import { formatRemainingTime } from '../utils/usageLimits';

interface UsageStatusProps {
  userRole: 'free' | 'paid';
  usageStats: UsageStats;
  hasReachedLimit: boolean;
  className?: string;
}

const UsageStatus: React.FC<UsageStatusProps> = ({
  userRole,
  usageStats,
  hasReachedLimit,
  className = '',
}) => {
  // Free user status display
  const renderFreeStatus = () => (
    <div className="text-center text-sm">
      <div className="text-gray-700 dark:text-gray-300 mb-2">
        {hasReachedLimit 
          ? 'Daily limit reached' 
          : `${usageStats.sessions}/5 sessions used today`}
      </div>
      <div className="text-gray-600 dark:text-gray-400 mb-4">
        1 min/session • {formatRemainingTime(60)} per session
      </div>
      <Link 
        to="/payment" 
        className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Upgrade to Unlimited
        <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );

  // Paid user status display
  const renderPaidStatus = () => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="text-center text-sm text-green-600 dark:text-green-400"
    >
      Unlimited sessions! Happy tracing 🎉
    </motion.div>
  );

  return (
    <div className={className}>
      {userRole === 'free' ? renderFreeStatus() : renderPaidStatus()}
    </div>
  );
};

export default UsageStatus;
