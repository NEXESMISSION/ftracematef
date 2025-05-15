import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { trackUsageSession, getUserDailyUsage } from '../services/supabaseClient';
import { UsageStats, UserPlan } from '../types';
import { USAGE_LIMITS, hasReachedSessionLimit } from '../utils/usageLimits';

interface UseUsageTrackingReturn {
  usageStats: UsageStats;
  sessionStartTime: Date | null;
  isSessionActive: boolean;
  hasReachedLimit: boolean;
  remainingSessionTime: number;
  startSession: () => void;
  endSession: () => Promise<void>;
  refreshUsageStats: () => Promise<void>;
}

export const useUsageTracking = (): UseUsageTrackingReturn => {
  const { user, userRole } = useAuth();
  const [usageStats, setUsageStats] = useState<UsageStats>({ sessions: 0, totalDuration: 0 });
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [remainingSessionTime, setRemainingSessionTime] = useState(USAGE_LIMITS.free.sessionDurationSecs);
  const timerRef = useRef<number | null>(null);

  // Check if user has reached their daily session limit
  const hasReachedLimit = hasReachedSessionLimit(usageStats.sessions, userRole as UserPlan);

  // Fetch user's daily usage stats
  const refreshUsageStats = async () => {
    try {
      if (!user) {
        // For non-logged in users, try to get session count from localStorage
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const storedSessions = localStorage.getItem(`sessions_${today}`);
        const sessionCount = storedSessions ? parseInt(storedSessions, 10) : 0;
        
        setUsageStats({ sessions: sessionCount, totalDuration: 0 });
        return;
      }

      // For logged-in users, get stats from database
      const stats = await getUserDailyUsage(user.id);
      setUsageStats(stats);
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      // Default to 0 if there's an error
      setUsageStats({ sessions: 0, totalDuration: 0 });
    }
  };

  // Start a new usage session
  const startSession = () => {
    if (hasReachedLimit && userRole === 'free') {
      console.warn('Daily session limit reached');
      return;
    }
    
    // Set session start time
    setSessionStartTime(new Date());
    setIsSessionActive(true);
    
    // Increment session count for tracking
    const newSessionCount = usageStats.sessions + 1;
    setUsageStats(prev => ({
      ...prev,
      sessions: newSessionCount
    }));
    
    // Save to localStorage for persistence
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      localStorage.setItem(`sessions_${today}`, String(newSessionCount));
      console.log(`Session tracking: ${newSessionCount} sessions used today`);
    } catch (error) {
      console.error('Error saving session count to localStorage:', error);
    }
    
    // Start timer for free users or non-signed in users
    if (userRole === 'free' || !user) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      timerRef.current = window.setInterval(() => {
        if (!sessionStartTime) return;

        const elapsedSecs = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
        const remaining = USAGE_LIMITS.free.sessionDurationSecs - elapsedSecs;

        setRemainingSessionTime(Math.max(0, remaining));

        // Auto-end session when time is up for free users or non-signed in users
        if (remaining <= 0) {
          endSession();
        }
      }, 1000);
    }
  };

  // End the current usage session
  const endSession = async () => {
    if (!isSessionActive || !sessionStartTime || !user) return;

    // Clear timer
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Calculate session duration
    const endTime = new Date();
    const durationSecs = Math.floor((endTime.getTime() - sessionStartTime.getTime()) / 1000);

    // Record session in database
    try {
      await trackUsageSession(user.id, durationSecs);
      await refreshUsageStats();
    } catch (error) {
      console.error('Error tracking session:', error);
    }

    // Reset session state
    setSessionStartTime(null);
    setIsSessionActive(false);
    setRemainingSessionTime(USAGE_LIMITS.free.sessionDurationSecs);
  };

  // Fetch initial usage stats on mount
  useEffect(() => {
    refreshUsageStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      
      // End session if active when component unmounts
      if (isSessionActive) {
        endSession();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSessionActive]);

  return {
    usageStats,
    sessionStartTime,
    isSessionActive,
    hasReachedLimit,
    remainingSessionTime,
    startSession,
    endSession,
    refreshUsageStats
  };
};
