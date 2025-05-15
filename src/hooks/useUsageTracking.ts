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
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!user) {
        // For non-logged in users, always use localStorage to track sessions
        const storedSessions = localStorage.getItem(`sessions_${today}`);
        const sessionCount = storedSessions ? parseInt(storedSessions, 10) : 0;
        
        console.log(`Non-logged in user has used ${sessionCount} sessions today`);
        setUsageStats({ sessions: sessionCount, totalDuration: 0 });
        return;
      }

      // For logged-in users, prioritize DB stats but also check localStorage
      const dbStats = await getUserDailyUsage(user.id);
      const storedSessions = localStorage.getItem(`sessions_${today}`);
      const localSessionCount = storedSessions ? parseInt(storedSessions, 10) : 0;
      
      // Use the higher count to ensure we don't miss any sessions
      const combinedSessions = Math.max(dbStats.sessions, localSessionCount);
      
      console.log(`Logged-in user has used ${combinedSessions} sessions today (DB: ${dbStats.sessions}, Local: ${localSessionCount})`);
      setUsageStats({
        ...dbStats,
        sessions: combinedSessions
      });
    } catch (error) {
      console.error('Error fetching usage stats:', error);
      
      // If there's an error, still try to get count from localStorage
      try {
        const today = new Date().toISOString().split('T')[0];
        const storedSessions = localStorage.getItem(`sessions_${today}`);
        const sessionCount = storedSessions ? parseInt(storedSessions, 10) : 0;
        
        setUsageStats({ sessions: sessionCount, totalDuration: 0 });
      } catch {
        // Last resort: default to 0
        setUsageStats({ sessions: 0, totalDuration: 0 });
      }
    }
  };

  // Start a new usage session
  const startSession = () => {
    // Check if it's a new day and reset localStorage if needed
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const storedDate = localStorage.getItem('last_session_date');
    
    if (storedDate !== today) {
      // It's a new day, reset the session count
      localStorage.setItem('last_session_date', today);
      localStorage.setItem(`sessions_${today}`, '0');
      console.log('New day detected, session count reset');
    }

    // Get current sessions from localStorage for all users (even logged in ones)
    const storedSessions = localStorage.getItem(`sessions_${today}`);
    const currentSessions = storedSessions ? parseInt(storedSessions, 10) : 0;

    // For non-logged-in users and free tier, check limits based on localStorage count
    if (!user || userRole === 'free') {
      if (currentSessions >= USAGE_LIMITS.free.sessionsPerDay) {
        console.warn('Daily session limit reached');
        setUsageStats({ sessions: currentSessions, totalDuration: 0 });
        return;
      }
    }
    
    // Set session start time
    const startTime = new Date();
    setSessionStartTime(startTime);
    setIsSessionActive(true);
    
    // Increment session count for tracking
    const newSessionCount = currentSessions + 1;
    
    // Update state
    setUsageStats(prev => ({
      ...prev,
      sessions: newSessionCount
    }));
    
    // Save to localStorage for all users
    try {
      localStorage.setItem(`sessions_${today}`, String(newSessionCount));
      console.log(`Session tracking: ${newSessionCount} sessions used today`);
    } catch (error) {
      console.error('Error saving session count to localStorage:', error);
    }
    
    // Start timer for free users or non-signed in users
    if (userRole === 'free' || !user) {
      // Clear any existing timer
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }

      // Set the remaining time immediately
      setRemainingSessionTime(USAGE_LIMITS.free.sessionDurationSecs);

      // Start countdown timer
      timerRef.current = window.setInterval(() => {
        const elapsedSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
        const remaining = USAGE_LIMITS.free.sessionDurationSecs - elapsedSecs;

        setRemainingSessionTime(Math.max(0, remaining));

        // Auto-end session when time is up for free users or non-signed in users
        if (remaining <= 0) {
          console.log('Session time limit reached, ending session');
          endSession();
        }
      }, 1000);
    }
  };

  // End the current usage session
  const endSession = async () => {
    if (!isSessionActive || !sessionStartTime) return;

    // Clear timer
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Calculate session duration
    const endTime = new Date();
    const durationSecs = Math.floor((endTime.getTime() - sessionStartTime.getTime()) / 1000);

    // For logged-in users, record in database
    if (user) {
      try {
        await trackUsageSession(user.id, durationSecs);
        await refreshUsageStats();
      } catch (error) {
        console.error('Error tracking session:', error);
      }
    } else {
      // For non-logged in users, just refresh local stats
      await refreshUsageStats();
    }

    console.log(`Session ended after ${durationSecs} seconds`);

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
