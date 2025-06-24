import React from 'react';
import { useUsageTracking } from '../hooks/useUsageTracking';
import { useAuth } from '../contexts/AuthContext';

const UsageTest: React.FC = () => {
  const { user, userRole, refreshUserRole } = useAuth();
  const { usageStats, hasReachedLimit, trackSession, refreshUsageStats } = useUsageTracking();

  const handleTestSession = () => {
    trackSession(120); // Simulate a 2-minute session
    console.log('Test session tracked');
  };

  const handleRefresh = () => {
    refreshUsageStats();
    console.log('Usage stats refreshed');
  };

  const handleRefreshRole = async () => {
    await refreshUserRole();
    console.log('User role refreshed');
  };

  return (
    <div className="fixed bottom-4 right-4 bg-dark-400/90 border border-primary-500/30 rounded-lg p-4 text-white text-sm z-50 max-w-xs">
      <h3 className="font-bold mb-2">Debug Panel</h3>
      <div className="space-y-1 text-xs">
        <div>User: {user ? user.email : 'Anonymous'}</div>
        <div>Role: {userRole}</div>
        <div>Sessions: {usageStats.sessions}/3</div>
        <div>Limit Reached: {hasReachedLimit ? 'Yes' : 'No'}</div>
        <div className="flex gap-1 mt-2 flex-wrap">
          <button
            onClick={handleTestSession}
            className="px-2 py-1 bg-blue-600 rounded text-xs"
          >
            Test Session
          </button>
          <button
            onClick={handleRefresh}
            className="px-2 py-1 bg-green-600 rounded text-xs"
          >
            Refresh Stats
          </button>
          <button
            onClick={handleRefreshRole}
            className="px-2 py-1 bg-purple-600 rounded text-xs"
          >
            Refresh Role
          </button>
        </div>
      </div>
    </div>
  );
};

export default UsageTest; 