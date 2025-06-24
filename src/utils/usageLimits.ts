import { UsageLimit, UserPlan } from '../types';

// Define usage limits for different plans
export const USAGE_LIMITS: Record<UserPlan, UsageLimit> = {
  free: {
    sessionDurationSecs: 120, // 2 minutes per session
    sessionsPerDay: 3, // 3 sessions per day
  },
  paid: {
    sessionDurationSecs: Infinity, // Unlimited time
    sessionsPerDay: Infinity, // Unlimited sessions
  },
};

// Check if user has reached their usage limits
export const hasReachedSessionLimit = (
  currentSessions: number,
  userPlan: UserPlan
): boolean => {
  return currentSessions >= USAGE_LIMITS[userPlan].sessionsPerDay;
};

// Get remaining time for current session
export const getRemainingSessionTime = (
  startTime: Date,
  userPlan: UserPlan
): number => {
  if (userPlan === 'paid') return Infinity;
  
  const elapsedSecs = Math.floor((Date.now() - startTime.getTime()) / 1000);
  const remainingSecs = USAGE_LIMITS.free.sessionDurationSecs - elapsedSecs;
  
  return Math.max(0, remainingSecs);
};

// Format remaining time for display
export const formatRemainingTime = (seconds: number): string => {
  if (seconds === Infinity) return 'Unlimited';
  
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
