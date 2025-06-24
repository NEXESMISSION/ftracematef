import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

// Create Supabase client with the public keys
// The anonpublic key is safe to use in the browser with RLS policies enabled

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Types for the database
export interface UsageStats {
  sessions: number;
  totalDuration: number;
}

export interface UserPlan {
  plan_id: string;
  plan_name: string;
  status: string;
  current_period_end: string | null;
}

export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  preferences: any;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  payment_intent_id: string | null;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentHistory {
  id: string;
  user_id: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  plan_id: string;
  plan_name: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
}

// Track usage session in database
export const trackUsageSession = async (userId: string, durationSecs: number = 0): Promise<{ success: boolean; error?: string }> => {
  try {
    const { data, error } = await supabase.rpc('track_usage_session', {
      user_uuid: userId,
      duration_seconds: durationSecs,
      session_type: 'tracing'
    });

    if (error) {
      console.error('Error tracking usage session:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error tracking usage session:', error);
    return { success: false, error: 'Failed to track usage session' };
  }
};

// Get user's daily usage stats
export const getUserDailyUsage = async (userId: string, targetDate?: string): Promise<UsageStats> => {
  try {
    const { data, error } = await supabase.rpc('get_user_daily_usage', {
      user_uuid: userId,
      target_date: targetDate || new Date().toISOString().split('T')[0]
    });

    if (error) {
      console.error('Error getting daily usage:', error);
      return { sessions: 0, totalDuration: 0 };
    }

    if (data && data.length > 0) {
      return {
        sessions: data[0].sessions_count || 0,
        totalDuration: data[0].total_duration_seconds || 0
      };
    }

    return { sessions: 0, totalDuration: 0 };
  } catch (error) {
    console.error('Error getting daily usage:', error);
    return { sessions: 0, totalDuration: 0 };
  }
};

// Get user's current subscription
export const getUserSubscription = async (userId: string): Promise<UserPlan | null> => {
  try {
    const { data, error } = await supabase.rpc('get_user_subscription', {
      user_uuid: userId
    });

    if (error) {
      console.error('Error getting user subscription:', error);
      return null;
    }

    if (data && data.length > 0) {
      return {
        plan_id: data[0].plan_id,
        plan_name: data[0].plan_name,
        status: data[0].status,
        current_period_end: data[0].current_period_end
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting user subscription:', error);
    return null;
  }
};

// Get user's subscription status
export const getUserSubscriptionStatus = async (userId: string): Promise<string> => {
  try {
    const { data, error } = await supabase.rpc('get_user_subscription_status', {
      user_uuid: userId
    });

    if (error) {
      console.error('Error getting subscription status:', error);
      return 'free';
    }

    return data || 'free';
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return 'free';
  }
};

// Check if user has reached daily limit
export const hasReachedDailyLimit = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('has_reached_daily_limit', {
      user_uuid: userId
    });

    if (error) {
      console.error('Error checking daily limit:', error);
      return false;
    }

    return data || false;
  } catch (error) {
    console.error('Error checking daily limit:', error);
    return false;
  }
};

// Check if user can start a session
export const canStartSession = async (userId: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('can_start_session', {
      user_uuid: userId
    });

    if (error) {
      console.error('Error checking if user can start session:', error);
      return true; // Default to allowing if check fails
    }

    return data || true;
  } catch (error) {
    console.error('Error checking if user can start session:', error);
    return true; // Default to allowing if check fails
  }
};

// Get user profile
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error getting user profile:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

// Update user profile
export const updateUserProfile = async (userId: string, updates: Partial<UserProfile>): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating user profile:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating user profile:', error);
    return { success: false, error: 'Failed to update user profile' };
  }
};

// Create or update user subscription
export const upsertUserSubscription = async (subscription: Partial<UserSubscription>): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('user_subscriptions')
      .upsert(subscription, { onConflict: 'user_id' });

    if (error) {
      console.error('Error upserting user subscription:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error upserting user subscription:', error);
    return { success: false, error: 'Failed to update subscription' };
  }
};

// Add payment to history
export const addPaymentHistory = async (payment: Partial<PaymentHistory>): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('payment_history')
      .insert(payment);

    if (error) {
      console.error('Error adding payment history:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error adding payment history:', error);
    return { success: false, error: 'Failed to add payment history' };
  }
};

// Get app settings
export const getAppSettings = async (settingKey: string): Promise<any> => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', settingKey)
      .single();

    if (error) {
      console.error('Error getting app settings:', error);
      return null;
    }

    return data?.setting_value;
  } catch (error) {
    console.error('Error getting app settings:', error);
    return null;
  }
};

// Get usage limits from app settings
export const getUsageLimits = async (): Promise<any> => {
  return await getAppSettings('usage_limits');
};

// Get payment plans from app settings
export const getPaymentPlans = async (): Promise<any> => {
  return await getAppSettings('payment_plans');
};

// Get app configuration from app settings
export const getAppConfig = async (): Promise<any> => {
  return await getAppSettings('app_config');
};
