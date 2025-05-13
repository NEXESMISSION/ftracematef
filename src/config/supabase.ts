// Supabase configuration for TraceMate

// These are the API keys as specified in the requirements
// The anonpublic key is safe to use in the browser with RLS policies enabled
export const SUPABASE_URL = 'https://your-supabase-project.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...';

// Note: The service_role key should never be exposed in client-side code
// It should only be used in secure server environments
// export const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...';

// JWT Secret is only used server-side for token minting/decoding
// export const JWT_SECRET = 'Q+x4x7fL0XOixAlOFW7tbUKYyIyhA6mZy...';

// Usage limits for different user plans
export const USAGE_LIMITS = {
  FREE: {
    SESSION_DURATION_SECS: 60, // 1 minute per session
    SESSIONS_PER_DAY: 5, // 5 sessions per day
  },
  PAID: {
    SESSION_DURATION_SECS: Infinity, // Unlimited time
    SESSIONS_PER_DAY: Infinity, // Unlimited sessions
  },
};
