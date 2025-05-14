import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

// Create Supabase client with the public keys
// The anonpublic key is safe to use in the browser with RLS policies enabled

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Usage tracking functions
export const trackUsageSession = async (userId: string, durationSecs: number) => {
  return await supabase
    .from('usage_sessions')
    .insert({
      user_id: userId,
      duration_secs: durationSecs,
      completed: true
    });
};

export const getUserDailyUsage = async (userId: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('usage_sessions')
    .select('*')
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`)
    .lte('started_at', `${today}T23:59:59`);
    
  if (error) {
    console.error('Error fetching user daily usage:', error);
    return { sessions: 0, totalDuration: 0 };
  }
  
  const sessions = data?.length || 0;
  const totalDuration = data?.reduce((sum, session) => sum + (session.duration_secs || 0), 0) || 0;
  
  return { sessions, totalDuration };
};

// Reset user's daily usage stats (for testing purposes)
export const resetUserDailyUsage = async (userId: string) => {
  const today = new Date().toISOString().split('T')[0];
  
  const { error } = await supabase
    .from('usage_sessions')
    .delete()
    .eq('user_id', userId)
    .gte('started_at', `${today}T00:00:00`)
    .lte('started_at', `${today}T23:59:59`);
    
  if (error) {
    console.error('Error resetting user daily usage:', error);
    throw error;
  }
  
  return true;
};
