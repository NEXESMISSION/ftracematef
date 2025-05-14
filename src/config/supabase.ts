// Supabase configuration for TraceMate

// These are the API keys as specified in the requirements
// The anonpublic key is safe to use in the browser with RLS policies enabled

// Define types for Vite environment variables
declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

// Check if environment variables are properly set
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl === 'https://your-supabase-project.supabase.co') {
  console.warn('⚠️ VITE_SUPABASE_URL is not properly configured in your .env file');
}

if (!supabaseAnonKey || supabaseAnonKey === 'your-actual-anon-key' || supabaseAnonKey === 'your-anon-key') {
  console.warn('⚠️ VITE_SUPABASE_ANON_KEY is not properly configured in your .env file');
}

export const SUPABASE_URL = supabaseUrl || 'https://your-supabase-project.supabase.co';
export const SUPABASE_ANON_KEY = supabaseAnonKey || 'your-anon-key';

// Note: The service_role key should never be exposed in client-side code
// It should only be used in secure server environments
// export const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...';

// JWT Secret is only used server-side for token minting/decoding
// export const JWT_SECRET = 'Q+x4x7fL0XOixAlOFW7tbUKYyIyhA6mZy...';

// Usage limits for different user plans
// All users now have unlimited access
export const USAGE_LIMITS = {
  FREE: {
    SESSION_DURATION_SECS: Infinity, // Unlimited time per session
    SESSIONS_PER_DAY: Infinity, // Unlimited sessions per day
  },
  PAID: {
    SESSION_DURATION_SECS: Infinity, // Unlimited time
    SESSIONS_PER_DAY: Infinity, // Unlimited sessions
  },
};
