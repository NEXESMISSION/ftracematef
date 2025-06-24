import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { USAGE_LIMITS } from '../utils/usageLimits';

interface UsageStats {
  sessions: number;
  totalDuration: number;
  avgDuration: number;
}

interface UsageTrackingData {
  date: string;
  sessions: number;
  sessionDurations: number[];
}

export const useUsageTracking = () => {
  const { user } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats>({
    sessions: 0,
    totalDuration: 0,
    avgDuration: 0,
  });
  const [hasReachedLimit, setHasReachedLimit] = useState(false);

  // Get today's date in YYYY-MM-DD format
  const getTodayString = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Get usage data from browser storage
  const getUsageData = (): UsageTrackingData => {
    const today = getTodayString();
    const storageKey = user ? `usage_${user.id}_${today}` : `usage_anonymous_${today}`;
    
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error reading usage data from storage:', error);
    }
    
    return {
      date: today,
      sessions: 0,
      sessionDurations: [],
    };
  };

  // Save usage data to browser storage
  const saveUsageData = (data: UsageTrackingData) => {
    const today = getTodayString();
    const storageKey = user ? `usage_${user.id}_${today}` : `usage_anonymous_${today}`;
    
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving usage data to storage:', error);
    }
  };

  // Track a new session
  const trackSession = useCallback((durationSeconds: number = 0) => {
    const today = getTodayString();
    const currentData = getUsageData();
    
    // If it's a new day, reset the data
    if (currentData.date !== today) {
      currentData.date = today;
      currentData.sessions = 0;
      currentData.sessionDurations = [];
    }
    
    // Increment session count
    currentData.sessions += 1;
    currentData.sessionDurations.push(durationSeconds);
    
    // Save updated data
    saveUsageData(currentData);
    
    // Update local state
    setUsageStats({
      sessions: currentData.sessions,
      totalDuration: currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0),
      avgDuration: currentData.sessionDurations.length > 0 
        ? Math.round(currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0) / currentData.sessionDurations.length)
        : 0,
    });
    
    // Check if limit reached
    const limit = user ? (user.role === 'paid' ? Infinity : USAGE_LIMITS.free.sessionsPerDay) : USAGE_LIMITS.free.sessionsPerDay;
    setHasReachedLimit(currentData.sessions >= limit);
    
    console.log(`Session tracked: ${currentData.sessions}/${limit} sessions used today`);
  }, [user]);

  // Start a new session (for tracking session duration)
  const startSession = useCallback(() => {
    const today = getTodayString();
    const currentData = getUsageData();
    
    // If it's a new day, reset the data
    if (currentData.date !== today) {
      currentData.date = today;
      currentData.sessions = 0;
      currentData.sessionDurations = [];
    }
    
    // Check if user has reached their limit
    const limit = user ? (user.role === 'paid' ? Infinity : USAGE_LIMITS.free.sessionsPerDay) : USAGE_LIMITS.free.sessionsPerDay;
    
    if (currentData.sessions >= limit) {
      console.log('User has reached daily limit, cannot start new session');
      setHasReachedLimit(true);
      return false; // Indicate that session could not be started
    }
    
    // Increment session count
    currentData.sessions += 1;
    currentData.sessionDurations.push(0); // Start with 0 duration
    
    // Save updated data
    saveUsageData(currentData);
    
    // Update local state
    setUsageStats({
      sessions: currentData.sessions,
      totalDuration: currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0),
      avgDuration: currentData.sessionDurations.length > 0 
        ? Math.round(currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0) / currentData.sessionDurations.length)
        : 0,
    });
    
    setHasReachedLimit(false);
    console.log(`Session started: ${currentData.sessions}/${limit} sessions used today`);
    return true; // Indicate that session was started successfully
  }, [user]);

  // End the current session and update duration
  const endSession = useCallback((durationSeconds: number = 0) => {
    const today = getTodayString();
    const currentData = getUsageData();
    
    // Update the last session duration
    if (currentData.sessionDurations.length > 0) {
      currentData.sessionDurations[currentData.sessionDurations.length - 1] = durationSeconds;
      saveUsageData(currentData);
      
      // Update local state
      setUsageStats({
        sessions: currentData.sessions,
        totalDuration: currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0),
        avgDuration: currentData.sessionDurations.length > 0 
          ? Math.round(currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0) / currentData.sessionDurations.length)
          : 0,
      });
      
      console.log(`Session ended with duration: ${durationSeconds} seconds`);
    }
  }, []);

  // Refresh usage stats
  const refreshUsageStats = useCallback(() => {
    const currentData = getUsageData();
    const today = getTodayString();
    
    // If it's a new day, reset the data
    if (currentData.date !== today) {
      currentData.date = today;
      currentData.sessions = 0;
      currentData.sessionDurations = [];
      saveUsageData(currentData);
    }
    
    setUsageStats({
      sessions: currentData.sessions,
      totalDuration: currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0),
      avgDuration: currentData.sessionDurations.length > 0 
        ? Math.round(currentData.sessionDurations.reduce((sum, duration) => sum + duration, 0) / currentData.sessionDurations.length)
        : 0,
    });
    
    // Check if limit reached
    const limit = user ? (user.role === 'paid' ? Infinity : USAGE_LIMITS.free.sessionsPerDay) : USAGE_LIMITS.free.sessionsPerDay;
    setHasReachedLimit(currentData.sessions >= limit);
  }, [user]);

  // Clean up old usage data (older than 7 days)
  const cleanupOldData = useCallback(() => {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('usage_')) {
          // Extract date from key (format: usage_userId_YYYY-MM-DD or usage_anonymous_YYYY-MM-DD)
          const datePart = key.split('_').pop();
          if (datePart) {
            const keyDate = new Date(datePart);
            if (keyDate < sevenDaysAgo) {
              localStorage.removeItem(key);
              console.log(`Cleaned up old usage data: ${key}`);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error cleaning up old usage data:', error);
    }
  }, []);

  // Initialize usage tracking
  useEffect(() => {
    refreshUsageStats();
    cleanupOldData();
    
    // Set up periodic cleanup (every hour)
    const cleanupInterval = setInterval(cleanupOldData, 60 * 60 * 1000);
    
    return () => clearInterval(cleanupInterval);
  }, [refreshUsageStats, cleanupOldData]);

  // Refresh stats when user changes
  useEffect(() => {
    refreshUsageStats();
  }, [user, refreshUsageStats]);

  return {
    usageStats,
    hasReachedLimit,
    trackSession,
    startSession,
    endSession,
    refreshUsageStats,
  };
};
